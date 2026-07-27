import { ValidationError } from "@realm/commons";
import { handler, json } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { ordersService } from "@/lib/services/orders.service";

type Params = { params: Promise<{ id: string }> };

/** Assign / clear Clover employee on a pickup order. */
export const POST = handler(async (request: Request, { params }: Params): Promise<Response> => {
  await requireAdmin();
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    employeePublicId?: unknown;
  };

  let employeePublicId: string | null;
  if (body.employeePublicId === null || body.employeePublicId === undefined || body.employeePublicId === "") {
    employeePublicId = null;
  } else if (typeof body.employeePublicId === "string") {
    employeePublicId = body.employeePublicId;
  } else {
    throw new ValidationError("employeePublicId must be a string or null");
  }

  return json(await ordersService.assignEmployee(id, employeePublicId));
});
