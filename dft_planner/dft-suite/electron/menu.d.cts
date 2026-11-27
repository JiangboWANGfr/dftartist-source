export interface MenuItemTemplate {
  label?: string;
  accelerator?: string;
  click?: () => void;
  role?: string;
  type?: "separator";
  submenu?: MenuItemTemplate[];
}

export declare function buildMenuTemplate(send: (action: string) => void): MenuItemTemplate[];
