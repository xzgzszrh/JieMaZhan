import { ButtonHTMLAttributes } from "react";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  success?: boolean;
};

export function ActionButton({ success = false, className = "", ...props }: ActionButtonProps) {
  const mergedClassName = [className, success ? "is-success" : ""].filter(Boolean).join(" ");
  return <button className={mergedClassName} {...props} />;
}

