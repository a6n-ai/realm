# Production deploy runbook

tiffin-grab and xplorers run ONLY on Cloudflare Workers (see `deployment/cloudflare/README.md`);
their EC2 boxes and deploy configs are gone. This folder now serves **puchkaman** (retired
2026-10-13, code kept, workflows manual-only): Box B, https://puchkaman.ca, **us-east-1**.
Deploy steps + folder layout: `puchkaman/RUNBOOK.md`.

## Folder layout (`deployment/prod/`)

```
Dockerfile              shared, multi-app (--build-arg APP=<name>)
deploy-all.sh           create edge net -> up proxy -> deploy puchkaman
proxy/                  standalone Caddy (443, auto-TLS) - the SOLE public ingress
puchkaman/              puchkaman compose + deploy.sh + RUNBOOK
neon-copy.sh, neon-fit.sh   Neon database helpers
```

Two sections below (S3 file storage, Files CDN) describe buckets and CloudFormation
stacks that are still live; their "redeploy the app on its box" steps apply to puchkaman only.

## File storage: S3 bucket (`tiffin-grab-files-<acct>-us-east-1-an`)

Provisioned 2026-07-16. Prod infra here is shell scripts plus this file, with one
CloudFormation template for DNS (`deployment/dns/route53-domain.yaml`). The bucket was
created by CLI and recorded here instead: it is one bucket and one IAM statement, and
CloudFormation **cannot create `SecureString` SSM parameters** — an unsupported type —
so the parameters below stay CLI regardless. Templating only the bucket would split this
one unit of work across two mechanisms. These commands are the source of truth; re-run
them to rebuild it. Revisit if CFN becomes the direction for prod infra beyond DNS.

The name is **not** a global-namespace name. The bucket lives in the account regional
namespace (`--bucket-namespace account-regional`), which is why it carries the
`<account-id>-<region>-an` suffix: only this account can create names in it, so there is
nothing to squat and nothing to enumerate. Only `create-bucket` needs the namespace flag
— every read/write/presign addresses it as an ordinary bucket name, and the app takes the
name from SSM, so it is config, not code.

**One private bucket, not two.** Block Public Access stays fully on. Public vs private is
the `resource_type` column (`static` | `secured`), not a bucket ACL: `urlFor()` presigns
`secured` rows and serves `static` rows off `FILES_PUBLIC_BASE_URL`. A public bucket is
the top S3 leak vector and buys nothing a cache header does not.

```bash
B=tiffin-grab-files-<acct>-us-east-1-an

aws s3api create-bucket --bucket "$B" --bucket-namespace account-regional --region us-east-1
aws s3api put-bucket-versioning --bucket "$B" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$B" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true,"BlockedEncryptionTypes":{"EncryptionType":["SSE-C"]}}]}'
aws s3api put-bucket-policy --bucket "$B" --policy \
  "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"DenyInsecureTransport\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",\"Resource\":[\"arn:aws:s3:::$B/*\",\"arn:aws:s3:::$B\"],\"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
```

Do **not** add `put-public-access-block` or ownership-control calls: S3 now enables BPA
and sets `BucketOwnerEnforced` by default on new buckets. Verified, not assumed —
all four BPA flags read back `true`. Re-setting them is a chance to get them wrong.

Instance-role grant (`s3-files-access` inline policy on `realm-tiffin-grab-prod-role`).
**Both ARNs are required**: `s3:ListBucket` targets the bucket itself, the object actions
target `/*`. Omitting the bare ARN is the classic `AccessDenied` on `list()`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::tiffin-grab-files-<acct>-us-east-1-an/*" },
    { "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::tiffin-grab-files-<acct>-us-east-1-an" }
  ]
}
```

Access logging is deliberately **not** configured: SAL-to-CloudWatch needs a
customer-managed KMS key plus ingest charges, and CloudTrail data events bill per
request — not worth it for dish photos on a `t2.micro`. Revisit on an incident.

Lifecycle rule — **required because versioning is on**. A versioned bucket leaks storage
three separate ways, and all three bill forever; one rule plugs all of them:

```bash
aws s3api put-bucket-lifecycle-configuration --bucket "$B" --lifecycle-configuration '{
  "Rules": [{
    "ID": "expire-noncurrent-and-orphans",
    "Status": "Enabled",
    "Filter": { "Prefix": "" },
    "NoncurrentVersionExpiration": { "NoncurrentDays": 30 },
    "Expiration": { "ExpiredObjectDeleteMarker": true },
    "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
  }]
}'
```

- `NoncurrentVersionExpiration` — every replaced dish photo keeps its old version
  forever without this. 30 days is the recovery window for a bad overwrite.
- `ExpiredObjectDeleteMarker` — a delete leaves a marker behind; once its versions age
  out the marker is billable clutter. **Cannot** be combined with `ExpirationInDays`,
  `ExpirationDate`, or `TagFilters` in the same rule.
- `AbortIncompleteMultipartUpload` — a failed upload leaves orphaned parts that bill
  forever and are **invisible to `s3 ls`**. The image uploader can multipart, so this is
  live. This is the classic silent S3 bill.

`put-bucket-lifecycle-configuration` **replaces the whole config** — `get` it first and
merge if a rule already exists.

Audit the bucket any time with:

```bash
aws s3api get-public-access-block --bucket "$B"      # expect all four true
aws s3api get-bucket-encryption --bucket "$B"        # expect AES256 + BucketKey + SSE-C blocked
aws s3api get-bucket-versioning --bucket "$B"        # expect Enabled
aws s3api get-bucket-policy --bucket "$B"            # expect DenyInsecureTransport
aws s3api get-bucket-lifecycle-configuration --bucket "$B"   # expect the expiry rule
```

Verify the **instance role** (not your own creds) can actually reach the bucket — this is
the grant most likely to be wrong, and it is what the app uses. Run it on the box:

```bash
ssh tiffin-prod
aws sts get-caller-identity --query Arn --output text   # expect assumed-role/realm-tiffin-grab-prod-role/...
echo test | aws s3 cp - "s3://$B/_verify/check.txt" --region us-east-1
aws s3api list-objects-v2 --bucket "$B" --prefix _verify --region us-east-1   # needs the bare bucket ARN
aws s3 rm "s3://$B/_verify/check.txt" --region us-east-1
```

Note `curl localhost:3000` on the box returns nothing — `web` does not publish 3000 to the
host. Caddy reaches it by container name over the `edge` net; test via the public URL.

## Files CDN (CloudFront) — optional, per app

Puts a CloudFront distribution in front of an app's private files bucket so images
serve from a Canadian edge (Toronto/Montreal) instead of the Next `/api/files` proxy
pulling every object through the Node process. Template:
[`deployment/cdn/cloudfront-files.yaml`](../cdn/cloudfront-files.yaml). One stack per app.

**Why it stays cheap.** `PriceClass_100` (US/Canada/Europe edges) is the cheapest class and
covers Canada. Origin→CloudFront S3 transfer is free; only edge→viewer is billed, and the
account's perpetual free tier (**1 TB out + 10M requests/month, shared account-wide**) covers
restaurant-scale traffic — realistically **$0/mo** for both apps. Past free tier it is
$0.085/GB (NA) + $0.01/10k requests.

**Why the bucket stays private.** Origin Access Control (OAC) makes CloudFront the only reader;
Block Public Access stays fully on. This does **not** contradict "one private bucket, not two"
above — there is still one private bucket. The CDN just replaces the app proxy as the public
read path for `static` objects.

### The public/secured split — READ THIS BEFORE ADDING A NEW APP

CloudFront cannot read the `file_system.resource_type` column, so the **only** thing keeping a
`secured` object (presigned, token-gated — e.g. ticket attachment originals) off the public CDN
is the S3 **key prefix** the policy is scoped to. The rule, enforced in the files package:

- `FileSystemService` takes a `keyPrefix` option. Every **static** `filesService` sets
  `keyPrefix: "public"`, so static objects are written under `public/*`. Secured services set
  no prefix (their objects live elsewhere, e.g. `tickets/*`).
- The CDN + bucket policy are scoped to `PublicKeyPattern` (default `public/*`). A secured
  object outside `public/*` is unreachable through the CDN even if its key is known.

**When you create a new client app, do this or the CDN is unsafe:**
1. Give the app's static `filesService` `keyPrefix: "public"` (copy `apps/tiffin-grab/lib/files/index.ts`).
2. Never write a `secured` object under `public/*`, and never write a `static` object into a
   prefix that also holds secured objects (tiffin-grab's `tickets/<id>/<nanoid>/` folder mixes
   `thumb-*` static + `orig-*` secured — the `keyPrefix` split is exactly what separates them:
   thumbnails become `public/tickets/...`, originals stay `tickets/...`).
3. Deploy the stack with `PublicKeyPattern=public/*`. Only use `PublicKeyPattern=*` when the
   bucket has **zero** secured objects (puchkaman today) — and re-scope the day that changes.

Existing objects created before the CDN keep their frozen `/api/files/...` URLs and keep serving
through the proxy; only new files get CDN URLs. No migration is required, and nothing breaks —
the two paths coexist. Backfill old URLs only if you want the old images on the edge too.

### Deploy

`AWS::S3::BucketPolicy` **refuses to create when the bucket already has a policy** — it will
not adopt one. So `ManageBucketPolicy=true` (the default, stack owns the policy) works only on
a bucket with **no** existing policy. A bucket that already has one (tiffin-grab carries
`DenyInsecureTransport`) must deploy with `ManageBucketPolicy=false` and get the CloudFront
statement merged in by CLI afterward. Both cases are shown below.

```bash
# --- puchkaman: no pre-existing bucket policy → stack owns it. PublicKeyPattern='*'
# is safe here (bucket has zero secured objects).
aws cloudformation deploy --region us-east-1 \
  --stack-name puchkaman-files-cdn \
  --template-file deployment/cdn/cloudfront-files.yaml \
  --parameter-overrides AppName=puchkaman \
    FilesBucketName=puchkaman-files-<acct>-us-east-1-an \
    PublicKeyPattern='*'

# --- tiffin-grab: bucket already has DenyInsecureTransport → do NOT let CFN own the policy.
aws cloudformation deploy --region us-east-1 \
  --stack-name tiffin-grab-files-cdn \
  --template-file deployment/cdn/cloudfront-files.yaml \
  --parameter-overrides AppName=tiffin-grab \
    FilesBucketName=tiffin-grab-files-<acct>-us-east-1-an \
    PublicKeyPattern='public/*' ManageBucketPolicy=false

# Then merge the CloudFront read statement into the existing policy by hand. Get the
# distribution id from the stack output, keep DenyInsecureTransport, add the OAC read
# scoped to public/* with the distribution as SourceArn:
B=tiffin-grab-files-<acct>-us-east-1-an
DIST=$(aws cloudformation describe-stacks --region us-east-1 --stack-name tiffin-grab-files-cdn \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)
aws s3api put-bucket-policy --bucket "$B" --policy "{
  \"Version\":\"2012-10-17\",\"Statement\":[
    {\"Sid\":\"DenyInsecureTransport\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",
     \"Resource\":[\"arn:aws:s3:::$B\",\"arn:aws:s3:::$B/*\"],
     \"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}},
    {\"Sid\":\"AllowCloudFrontStaticRead\",\"Effect\":\"Allow\",
     \"Principal\":{\"Service\":\"cloudfront.amazonaws.com\"},\"Action\":\"s3:GetObject\",
     \"Resource\":\"arn:aws:s3:::$B/public/*\",
     \"Condition\":{\"StringEquals\":{\"AWS:SourceArn\":\"arn:aws:cloudfront::<acct>:distribution/$DIST\"}}}
  ]}"

# --- both apps: store the CDN base URL as the app's SSM param, then redeploy the app.
URL=$(aws cloudformation describe-stacks --region us-east-1 --stack-name puchkaman-files-cdn \
  --query "Stacks[0].Outputs[?OutputKey=='FilesPublicBaseUrl'].OutputValue" --output text)
aws ssm put-parameter --region us-east-1 --overwrite --type SecureString \
  --name /puchkaman/prod/FILES_PUBLIC_BASE_URL --value "$URL"
# (repeat for tiffin-grab-files-cdn → /tiffin-grab/prod/FILES_PUBLIC_BASE_URL)

# Redeploy each app on its box so deploy.sh pulls the new param into .env.production.
```

Custom domain (e.g. `cdn.puchkaman.ca`) is optional: pass `AlternateDomainName` +
`AcmCertificateArn` (cert must be in **us-east-1**) and point a DNS CNAME at the distribution.
Without them the `*.cloudfront.net` domain works immediately, no DNS or cert needed.

## DB access from a laptop

puchkaman's RDS admits 5432 only from its own security group, so the tunnel exits on its box via SSM:

```bash
./deployment/prod/db-tunnel.sh puchkaman     # localhost:5434  (us-east-1)
```

Point the IDE data source at `localhost:5434` with no tunnel configured. Needs
`brew install --cask session-manager-plugin` once per laptop.
