"use client";

import { ContactListMemberRow } from "@relay/engine/ui/contact-list-member-row";
import { unwrapAction } from "@/lib/actions/unwrap";
import { convertContactToCustomer } from "./actions";

// The relay row expects onConvert to throw; the action returns its refusal instead.
export function ConvertibleMemberRow(props: Omit<Parameters<typeof ContactListMemberRow>[0], "onConvert">) {
  return <ContactListMemberRow {...props} onConvert={(input) => unwrapAction(convertContactToCustomer(input))} />;
}
