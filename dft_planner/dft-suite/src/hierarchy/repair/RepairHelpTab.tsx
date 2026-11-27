// Port of HelpWindow (src/ui/SramRepairAdvisor.cpp:919-1015) — the full help page, ported
// essentially verbatim from the Qt QTextBrowser HTML.
const HELP_HTML = `
  <h1>SRAM Repair Advisor Help</h1>
  <p>This tool helps analyze SRAM repair strategies based on memory size distributions. It has three
  tools: the <b>Redundancy Guideline</b> (strategy + editable Table 1), the <b>Binomial Model</b> and the
  <b>Foundry Model</b>.</p>

  <h2>General usage — workflow</h2>
  <ol>
      <li><b>Redundancy Guideline</b>: review the strategy and cautions, and set the recommended
          redundancy mix per memory size band.</li>
      <li><b>Select a model</b>: Binomial or Foundry.</li>
      <li><b>Binomial</b>: works purely from process parameters — no memory data required.</li>
      <li><b>Foundry</b>: type or paste your memory list into the model's table, then Calculate.</li>
      <li><b>Apply Strategy</b>: apply repair recommendations to the data (Foundry).</li>
      <li><b>Fuse Calculation</b> (optional): estimate fuse requirements.</li>
  </ol>

  <hr>
  <h1>Binomial Model</h1>
  <p>Calculates yield based on defect density and memory area — no memory data required.</p>
  <h3>Parameters</h3>
  <ul>
      <li><b>D0</b>: Baseline defect density</li>
      <li><b>Complexity</b>: Process complexity factor</li>
      <li><b>Area</b>: Normalization factor</li>
      <li><b>Alpha</b>: Clustering parameter</li>
      <li><b>Adjust</b>: Adjustment factor</li>
  </ul>
  <h3>Yield curve</h3>
  <p>The tool plots the cumulative yield curve and identifies the point where yield reaches 99.9%.</p>

  <hr>
  <h1>Foundry Model</h1>
  <p>Uses redundancy-free density to determine which memories need repair.</p>
  <h3>Parameters</h3>
  <ul>
      <li><b>Redundancy Free Density</b>: Threshold for determining which memories need repair (e.g., 10K, 1M)</li>
      <li><b>Efuse Usage Rate</b>: Percentage of repairs that will actually use efuses (0-1)</li>
  </ul>
  <h3>Entering memories</h3>
  <p>Type or paste your memory list directly into the table (no data file needed). Each row is one
  memory: <b>Normalized</b> = total physical bits (K/M/G ok, e.g. 96K), <b>GenerateNum</b> = optional
  count/weight (default 1). Use <b>+ Row</b> / <b>− Row</b> / <b>Paste</b> / <b>Clear</b> to manage the
  list. Paste imports a list copied from a spreadsheet — one memory per line.</p>
  <h3>Calculation method</h3>
  <p>Memories are sorted by size, and repairs are recommended for those above the redundancy-free threshold.</p>

  <hr>
  <h1>Redundancy Guideline (Table 1)</h1>
  <p>Maps a memory instance's total physical bit-count to the recommended mix of redundancy methods
  (No Redundancy / Column Only / Column + Row). The table is fully editable and your edits are persisted
  between sessions.</p>
  <h3>How to use it</h3>
  <ul>
      <li><b>Edit a percentage</b>: double-click any cell.</li>
      <li><b>Edit a size band</b>: double-click a column header (enter lower / upper bounds; K/M/G accepted).</li>
      <li><b>Rename a method</b>: double-click a row header.</li>
      <li><b>Add / remove</b> methods (rows) or size bands (columns) with the toolbar buttons.</li>
      <li><b>Look up</b> a specific memory by entering its total physical bits — the tool reports which
          band it lands in and the recommended redundancy.</li>
  </ul>
  <p>Each size band's mix should total 100%; the page flags any band that does not.</p>
  <h3>General design guidelines</h3>
  <ul>
      <li>Require all SRAM instances to be compiled with repair (parametric yield is driven by total bitcount; fails can occur anywhere).</li>
      <li>Repair infrastructure should enable upwards of 250 repair actions (~2X TSMC guidance).</li>
      <li>ROM memories are excluded — they have no redundancy options.</li>
      <li>Small configurations should skew heavily to Column Only and away from Column + Row.</li>
      <li>The table is a conservative recommendation; the mix may be loosened case by case (e.g. for a PPA target).</li>
  </ul>

  <hr>
  <h1>FAQ</h1>
  <h3>Q: What units should I use for memory sizes?</h3>
  <p>A: The tool accepts raw numbers or values with K/M/G suffixes (e.g., 16K, 1M, 0.5G). Internally, all
  values are converted to raw counts (1K = 1024).</p>
  <h3>Q: How is the repair strategy applied?</h3>
  <p>A: The strategy is applied based on the normalized memory size. Each tier defines a size range and the
  recommended repair method for memories in that range.</p>
  <h3>Q: Can I customize the repair strategy?</h3>
  <p>A: Yes, click the "Edit Strategy" button in either model to modify the size ranges and repair methods.</p>
`;

export function RepairHelpTab() {
  return (
    <div style={{ overflow: "auto", minHeight: 0, flex: 1, padding: "6px 18px", color: "#d4d4d4" }}
         dangerouslySetInnerHTML={{ __html: HELP_HTML }} />
  );
}
