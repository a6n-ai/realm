// Product images only need the "static" resource type — no secured/ak-token
// access path, so only the fileSystem table (not filesAccessPath /
// filesSecuredAccessKey) is pulled in from @realm/storage's schema.
export { fileResourceType, fileSystemNodeType, fileSystem } from "@realm/storage/schema";
