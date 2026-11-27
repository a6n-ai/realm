import { passwordSchema } from "@foundry/commons";
import { z } from "zod";

export const setPasswordSchema = z.object({ password: passwordSchema });
