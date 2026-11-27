# Provide sts_git checkout (and sparse_checkout) functionality as a python module so it can
# be used in sts_git and scons (from sts_checkout.py)

from __future__ import print_function
import os
import sys
import re
import subprocess
import yaml
import textwrap

def notice(msg):
   print("[sts_git] " + msg)

def warning(msg):
   print("[sts_git] WARNING: " + msg, file=sys.stderr)

def error(msg):
   raise SystemExit("[sts_git] ERROR: " + msg)

def findGitRepo():
   cwd = os.getcwd()
   while cwd != "/":
      path = os.path.join(cwd,".git")
      if os.path.isdir(path) :
         return path
      cwd,tail = os.path.split(cwd)
   return None

def isCheckoutModified():
   cmd = subprocess.Popen(['git', 'status', '--porcelain'], stdout = subprocess.PIPE)
   for line in cmd.stdout:
      if re.search("^ ?[MADR]",line):
         return True
   return False

def sparse_checkout(args):
  mapped_dirs={}
  repo = findGitRepo()
  if not repo:
    error("Cannot find .git directory")

  if isCheckoutModified():
    error("There are local edits in your checkout (added, modified or deleted files)")

  sparse_file = os.path.join(repo,"info","sparse-checkout")
  file=open(sparse_file,"r")
  for line in file:
    line = line.rstrip('\n')
    mapped_dirs[line]=1
  file.close()

  # add in the new items
  new_items=[]
  for arg in args:
    if not arg.startswith('/'):
       arg = '/' + arg
    if not mapped_dirs.has_key(arg):
      mapped_dirs[arg]=1
      new_items.append(arg)

  if new_items:
    new_mods = " ".join(new_items)
    notice("New modules to check out: " + new_mods)
    # write out the updated sparse-checkout file
    file=open(sparse_file,"w");
    for line in mapped_dirs.keys():
      file.write(line + "\n")
    file.close()
    # ... and update the checkout
    subprocess.check_call(["git", "read-tree", "-u", "-m", "HEAD"])

def uncheckout(args):

  if isCheckoutModified():
    error("There are local edits in your checkout (added, modified or deleted files)")

  repo = findGitRepo()
  if not repo:
    error("Cannot find .git directory")

  mapped_prods=[]
  mapped_libs=[]
  raw_entries=[]
  for arg in args:
    if os.path.isdir("prods/" + arg):
       mapped_prods.append("prods/" + arg)
    elif os.path.isdir("libs/" + arg):
       mapped_libs.append("libs/" + arg)
    elif os.path.isdir(arg):
       raw_entries.append(arg)
    else:
       error("Could not find '" + arg + "' in prods or libs directory")

  if raw_entries:
    sparse_uncheckout(raw_entries)
    # if you are also doing uncheckout of prods, then we will rebuild dependencies..
    if not mapped_prods:
      notice("'uncheckout' of entries may result in unresolved dependencies");
  if mapped_prods:
    if mapped_libs:
       notice("doing uncheckout of products. Any explicit library specifications will be ignored");
    fnames = mapped_prods
    # aggressive approach - uncheckout all libs
    notice("doing uncheckout of requested products and all libraries!")
    sep = os.path.sep
    lib_path = repo + sep + ".." + sep + "libs";
    fnames=[]
    mapped_names = mapped_prods
    if os.path.isdir(lib_path):
      fnames.extend(os.listdir(lib_path))
    for name in fnames:
       mapped_names.append("libs" + sep + name)

    sparse_uncheckout(mapped_names)
    notice("Calling scons to bring back dependent libraries")
    cmd = ['scons', '--bits=32,64', '--checkout-deps']
    with open(os.devnull, 'w') as devnull:
       subprocess.check_call(cmd, stdout=devnull)

  elif mapped_libs:
    sparse_uncheckout(mapped_libs)
    notice("'uncheckout' of libs may result in unresolved dependencies");

def sparse_uncheckout(args):

  repo = findGitRepo()
  if not repo:
    error("Cannot find .git directory")

  if isCheckoutModified():
    error("There are local edits in your checkout (added, modified or deleted files)")

  sparse_file = os.path.join(repo,"info","sparse-checkout")
  saved_lines=[]
  deleted_lines=[]
  file=open(sparse_file,"r")

  for line in file:
    line = line.rstrip('\n')
    if line.startswith('/'):
      line = line.lstrip("/")
    gotMatch = False
    for arg in args:
      if line in args:
         gotMatch = True
         break
    if not gotMatch:
      saved_lines.append(line)
    else:
      if not line in deleted_lines:
        deleted_lines.append(line)

  file.close()

  # make sure args doesn't contain any unresolvable entries
  for arg in args:
    if not arg in deleted_lines:
      error("Could not find '" + arg + "' in sparse-checkout file.")

  # delete the current directory contents... this is the dangerous part

  for line in deleted_lines:
    if os.path.isdir(line):
        notice("sparse-uncheckout is removing directory and files in path '" + line + "'")
        subprocess.check_call(["rm", "-rf", line])
    else:
      error("Could not find '" + line + "' directory")

  # write out the updated sparse-checkout file
  file=open(sparse_file,"w");
  for line in saved_lines:
    file.write("/" + line + "\n")
  file.close()

  # ... and update the checkout
  subprocess.check_call(["git", "read-tree", "-u", "-m", "HEAD"])

def initAfterClone():
  sparse_checkout(["/site_scons", "/SConstruct", "/.gitignore", "/tools/doxygen", "/tools/scripts", "/tools/gtest", "/_clang-format", "/.arcconfig", "/tools/git-hooks"])
  notice("Updating git config to use git hooks from local tools/git-hooks directory")
  subprocess.check_call("git config core.hooksPath ./tools/git-hooks", shell=True)

# NOTE: This only seems to work (prods/*, libs/*) when the prods and libs directories are empty
def gitLsTree(path):
   result = {}
   cmd = ["git", "ls-tree", "--name-only", "HEAD", path]
   p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
   while 1:
      elem = p.stdout.readline().rstrip()
      if not elem:
         break
      result[elem] = True
   return result

def findDir(subdir):
   for d in ['', 'libs', 'prods']:
      path = os.path.join(d, subdir)
      r = gitLsTree(path)
      if len(r):
         return path
   return None

def pkgHandler(arg):
   fh = open('tools/site_scons/sts_pkg_info.yaml', 'r')
   if not fh:
      error("Could not open 'tools/site_scons/sts_pkg_info.yaml' file for reading")
   sts_pkg_info = yaml.load(fh)

   if not sts_pkg_info['product_config'].has_key(arg):
      error("Invalid package name '" + arg + "'")

   prod_info = sts_pkg_info['product_config'][arg]
   if not prod_info['modules']:
      error("Internal data error in sts_pkg_info.yaml for '" + arg + "'")

   result = {}
   for mod in prod_info['modules']:
      path = findDir(mod)
      if path:
         result[path] = True

   return result

def getValidProdsAndLibs():
   cmd = ["git", "ls-tree", "--name-only", "HEAD", "-r"]
   p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
   prods = {}
   libs = {}
   while 1:
      elem = p.stdout.readline().rstrip()
      if not elem:
         break
      match = re.search(r'^(\w+)/(\w+)*', elem)
      if match:
        if match.group(1)=="prods":
           prods[match.group(2)]=True 
        else:
           libs[match.group(2)]=True 

   msg = "  valid prods:\n"
   msg += textwrap.fill(' '.join(sorted(prods.keys())), initial_indent='    ', subsequent_indent='    ')
   msg += "\n  valid libs:\n"
   msg += textwrap.fill(' '.join(sorted(libs.keys())), initial_indent='    ', subsequent_indent='    ')
   #DBG print("msg = "  + msg)
   return msg

def checkout(args):

   if not args:
     msg = "'checkout' sub-command requires at least one argument (prod or lib name)\n"
     msg = msg + getValidProdsAndLibs()
     error(msg)
     return

   if 'tools/git-hooks' in args:
      notice("attempting to checkout tools/git-hooks")
      dirty = False;
      if isCheckoutModified():
          dirty=True
          notice("Local changes - temporarily stashing them")
          subprocess.check_call(["git", "stash"])

      notice("doing sparse checkout of tools/git-hooks")
      sparse_checkout(["/tools/git-hooks"])
      notice("updating local git config to point at tools/git-hooks directory")
      subprocess.check_call(["git", "config", "core.hooksPath", "./tools/git-hooks"])

      repo = findGitRepo()
      gitCommitHook = repo + "/hooks/commit-msg"
      if os.path.exists(gitCommitHook):
          msg = "removing legacy git commit hook: " + gitCommitHook
          notice(msg)
          os.remove(gitCommitHook)

      if dirty:
          notice("restoring local changes")
          subprocess.check_call(["git", "stash","pop"])
      return

   repo = findGitRepo()
   if not repo:
      error("Could not find a .git directory in CWD or above")

   # FIXME: special case - force checkout of yaserver along with testkompress
   if 'testkompress' in args:
     if 'ya_server' not in args:
        notice("Forcing checkout of ya_server along with testkompress")
        args.append("ya_server")

   checkout_deps = True
   mapped_dirs = {}
   for arg in args:
      # ignore switches
      if arg.startswith("-"):
         warning("Ignoring unknown or obsolete option '" + arg + "'")
         continue

      # handle "all_*" aliases
      if arg == "all_libs":
         mapped_dirs.update(gitLsTree("libs/"))
         continue
      if arg == "all_prods":
         mapped_dirs.update(gitLsTree("prods/"))
         continue

      # skip projects that end with "_pkg"
      if arg.endswith("_pkg"):
         mapped_dirs.update(pkgHandler(arg))
         continue

      path = findDir(arg)
      if path:
         mapped_dirs[path] = True
      else:
         msg = "Invalid project name : '" + arg + "'\n"
         msg = msg + getValidProdsAndLibs()
         error(msg)

   # Sparse checkout requested directories
   sparse_checkout(mapped_dirs.keys())

   # Let Scons check out dependant libraries
   if checkout_deps:
      notice("Calling scons to check for dependent libraries")
      cmd = ['scons', '--bits=32,64', '--checkout-deps']
      with open(os.devnull, 'w') as devnull:
         subprocess.check_call(cmd, stdout=devnull)
