import { defineBackend } from "@aws-amplify/backend";
import { data } from "./data/resource";
import { notifyDrainer } from "./functions/notify-drainer/resource";
import { appsyncAuthorizer } from "./functions/appsync-authorizer/resource";

defineBackend({
  data,
  notifyDrainer,
  appsyncAuthorizer,
});
