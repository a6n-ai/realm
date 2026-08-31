export const Role = { ADMIN: "admin", MEMBER: "member", USER: "user" } as const;
export type RoleValue = (typeof Role)[keyof typeof Role];
