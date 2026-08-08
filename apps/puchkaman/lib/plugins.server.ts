import type { PluginRegistry } from "@realm/crm/server";
import { cloverPlugin } from "@realm/clover/server";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

export const PLUGINS: PluginRegistry = [cloverPlugin(integrationsConfigStore)];
