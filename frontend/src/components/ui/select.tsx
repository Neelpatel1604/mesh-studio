"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

type SelectRootProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
};

type SelectTriggerProps = React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode };
type SelectContentProps = { children?: React.ReactNode };
type SelectGroupProps = { children?: React.ReactNode };
type SelectItemProps = { value: string; children?: React.ReactNode };
type SelectLabelProps = { children?: React.ReactNode };
type SelectSeparatorProps = Record<string, never>;
type SelectScrollProps = { children?: React.ReactNode };

function Select({ value, onValueChange, children }: SelectRootProps) {
  const options: Array<{ value: string; label: string }> = [];
  let triggerProps: SelectTriggerProps | undefined;

  const visit = (node: React.ReactNode) => {
    if (!React.isValidElement(node)) return;
    if (node.type === SelectTrigger) triggerProps = node.props as SelectTriggerProps;
    if (node.type === SelectItem) {
      const props = node.props as SelectItemProps;
      const label = typeof props.children === "string" ? props.children : String(props.value);
      options.push({ value: props.value, label });
    }
    const nested = (node.props as { children?: React.ReactNode }).children;
    if (nested) React.Children.forEach(nested, visit);
  };

  React.Children.forEach(children, visit);

  return (
    <select
      className={cn("shad-select-trigger", triggerProps?.className)}
      aria-label={triggerProps?.["aria-label"]}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function SelectTrigger({ children }: SelectTriggerProps) {
  return <>{children}</>;
}

function SelectValue(_: { placeholder?: string }) {
  return null;
}

function SelectContent({ children }: SelectContentProps) {
  return <>{children}</>;
}

function SelectGroup({ children }: SelectGroupProps) {
  return <>{children}</>;
}

function SelectItem(_: SelectItemProps) {
  return null;
}

function SelectLabel({ children }: SelectLabelProps) {
  return <>{children}</>;
}

function SelectSeparator(_: SelectSeparatorProps) {
  return null;
}

function SelectScrollDownButton({ children }: SelectScrollProps) {
  return <>{children}</>;
}

function SelectScrollUpButton({ children }: SelectScrollProps) {
  return <>{children}</>;
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue };
