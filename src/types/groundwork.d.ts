declare module "@usace/groundwork" {
  import type { ComponentType, HTMLAttributes, InputHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

  export const Button: ComponentType<ButtonHTMLAttributes<HTMLButtonElement>>;
  export const LoginButton: ComponentType<{
    onClick?: () => void;
  }>;
  export const ProfileDropdown: ComponentType<{
    email?: string;
    username?: string;
    showLogout?: boolean;
    onLogout?: () => void;
    links?: Array<{ id: string; text: string; link: string }>;
  }>;
  export const Checkboxes: ComponentType<{
    legend?: string;
    className?: string;
    content: Array<{
      id?: string;
      name?: string;
      label?: ReactNode;
      description?: ReactNode;
      defaultChecked?: boolean;
      disabled?: boolean;
      onClick?: InputHTMLAttributes<HTMLInputElement>["onClick"];
      onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
      inputProps?: InputHTMLAttributes<HTMLInputElement>;
      labelProps?: HTMLAttributes<HTMLLabelElement>;
      className?: string;
      ariaDescribedBy?: string;
    }>;
  }>;
  export const Input: ComponentType<InputHTMLAttributes<HTMLInputElement>>;
  export const Label: ComponentType<HTMLAttributes<HTMLLabelElement>>;
  export const Field: ComponentType<HTMLAttributes<HTMLDivElement>>;
  export const Fieldset: ComponentType<HTMLAttributes<HTMLFieldSetElement>>;
  export const Legend: ComponentType<HTMLAttributes<HTMLLegendElement>>;
  export const Header: ComponentType<HTMLAttributes<HTMLElement>>;
  export const SiteWrapper: ComponentType<
    {
      children?: ReactNode;
      navRight?: ReactNode;
      showFooter?: boolean;
      links?: Array<{ title?: string; href?: string; to?: string; children?: ReactNode }>;
      usaBanner?: boolean;
      msgBanner?: ReactNode;
      msgBannerPosition?: "top" | "bottom";
      title?: string;
      homeUrl?: string;
      fluidNav?: boolean;
      subtitle?: string;
      missionText?: string;
      aboutText?: string;
      armyLogo?: boolean;
      usaceLogo?: boolean;
      cwbiLogo?: boolean;
    } & HTMLAttributes<HTMLDivElement>
  >;
  export const Table: ComponentType<HTMLAttributes<HTMLTableElement>>;
  export const TableHead: ComponentType<HTMLAttributes<HTMLTableSectionElement>>;
  export const TableBody: ComponentType<HTMLAttributes<HTMLTableSectionElement>>;
  export const TableHeader: ComponentType<HTMLAttributes<HTMLTableCellElement>>;
  export const TableRow: ComponentType<HTMLAttributes<HTMLTableRowElement>>;
  export const TableCell: ComponentType<HTMLAttributes<HTMLTableCellElement>>;
  export function gwMerge(...classNames: Array<string | false | null | undefined>): string;
}
