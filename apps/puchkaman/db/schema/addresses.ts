import { makeAddressTables } from "@foundry/address/schema";
import { users } from "./auth";
import { organization } from "./organizations";

export const { customerAddresses } = makeAddressTables({ users, organization });
