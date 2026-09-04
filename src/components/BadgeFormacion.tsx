interface Props { formacion: string; size?: "sm" | "md"; color?: string; }

export function BadgeFormacion({ formacion, size = "sm", color = "blue" }: Props) {
  const sizes = { sm: "text-[10px] px-2 py-0.5", md: "text-xs px-2.5 py-1" };
  const colors: { [key: string]: string } = {
    blue: "bg-blue-950/80 text-blue-300 border-blue-500/20",
    red: "bg-red-950/80 text-red-300 border-red-500/20",
    gray: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700",
  };
  return (
    <span className={`inline-block font-bold rounded-full border ${sizes[size]} ${colors[color] || colors.gray}`}>
      {formacion}
    </span>
  );
}
