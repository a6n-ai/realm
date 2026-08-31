// Product images only need the "static" resource type — no secured/ak-token
// access path, so only the fileSystem table (not filesAccessPath /
// filesSecuredAccessKey) is pulled in from @foundry/storage's schema.
export { fileResourceType, fileSystemNodeType, fileSystem } from "@foundry/storage/schema";
