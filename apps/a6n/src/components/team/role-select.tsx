import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";

export type RoleOption = { name: string; builtIn: boolean };

export const roleLabel = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

// Roles the viewer may hand out (the server lists them and re-checks every change).
export function RoleSelect({ value, roles, onChange, label, disabled }: { value: string; roles: RoleOption[]; onChange: (role: string) => void; label: string; disabled?: boolean }) {
  const options = roles.some((r) => r.name === value) ? roles : [{ name: value, builtIn: true }, ...roles];
  return (
    <Select value={value} onValueChange={(v) => v && onChange(String(v))} disabled={disabled}>
      <SelectTrigger aria-label={label} className="min-w-32">
        <SelectValue>{roleLabel(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((r) => (
          <SelectItem key={r.name} value={r.name}>
            {roleLabel(r.name)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
