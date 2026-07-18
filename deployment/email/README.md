# SES email — tiffin-grab

Provisions the SES sending identity so transactional mail (password reset, email
verification, notification outbox) actually leaves. App code sends via
`@realm/email` `SesEmailProvider`; nothing delivers until the steps below are done.

`realm-admin` has no SES/SNS/IAM permissions — run these with an elevated principal
or the AWS console.

> **DNS lives at Hostinger, not Route 53.** `tiffingrab.ca` is managed in the
> Hostinger DNS panel, so the stack does NOT write DNS records — it outputs them
> and you paste them into Hostinger by hand. (puchkaman.ca is on Route 53 and
> could auto-add; tiffingrab can't.)

## 1. Deploy the identity stack

```bash
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name tiffin-grab-ses \
  --template-file deployment/email/ses-tiffin-grab.yaml \
  --parameter-overrides DomainName=tiffingrab.ca

aws cloudformation describe-stacks --region us-east-1 \
  --stack-name tiffin-grab-ses --query 'Stacks[0].Outputs' --output table
```

The identity is created "unverified" — it verifies once the DNS below resolves.

## 2. Add the DNS records in Hostinger

From the stack Outputs, add these in **Hostinger → Domains → tiffingrab.ca → DNS**.
Hostinger's "Name" is relative to the zone, so strip the trailing `.tiffingrab.ca`
from each host (e.g. `abc123._domainkey.tiffingrab.ca` → name `abc123._domainkey`).
Set TTL to whatever Hostinger defaults (300–3600 is fine).

| # | Type | Name (host) | Value | Notes |
|---|------|-------------|-------|-------|
| 1 | CNAME | `DkimRecord1Name` | `DkimRecord1Value` | DKIM key 1 |
| 2 | CNAME | `DkimRecord2Name` | `DkimRecord2Value` | DKIM key 2 |
| 3 | CNAME | `DkimRecord3Name` | `DkimRecord3Value` | DKIM key 3 |
| 4 | MX | `mail` | `MailFromMxValue` | priority **10** |
| 5 | TXT | `mail` | `MailFromSpfValue` | SPF for MAIL FROM |

(Optional, recommended) DMARC: TXT, name `_dmarc`, value
`v=DMARC1; p=none; rua=mailto:dmarc@tiffingrab.ca`.

Then wait for SES to flip the identity to **Verified** (Console → SES →
Identities). Usually minutes after Hostinger propagates; can take up to ~72h.

Grab the `IdentityArn` output for step 3.

## 3. Grant the EC2 instance role send permission

The app sends with the box's instance-role creds. Attach this policy to that role
(role name lives with whoever manages the instance profile):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ses:SendEmail", "ses:SendRawEmail"],
    "Resource": "<IdentityArn from stack output>"
  }]
}
```

## 4. Exit the SES sandbox

New accounts are sandboxed: mail only reaches **verified** recipient addresses,
and the daily/rate quota is tiny. Request production access:

Console → SES → Account dashboard → **Request production access** (or a support
case). Until granted, verify a test recipient address to exercise the flow.

## 5. Verify end-to-end

1. In prod, trigger a password reset for a verified recipient address.
2. Confirm the email arrives and DKIM/SPF pass (Gmail: "Show original" → PASS).
3. Check the box logs: `auth-email` logger shows `password reset sent to …`.

## Phase 2 — bounce/complaint suppression

SES config set publishes BOUNCE/COMPLAINT to an SNS topic → the signature-verified
`/api/webhooks/ses` route flips `notification_prefs.suppressed`; the enqueue path
(`resolveChannels`) then stops emailing that address. Stack:
`deployment/email/ses-suppression.yaml`.

**Order matters** — the webhook must be live before the SNS subscription is created,
or SNS can't auto-confirm it:

1. **Ship the webhook**: merge to `main` and let prod deploy (route lives at
   `app/api/webhooks/ses`). Confirm `https://app.tiffingrab.ca/api/webhooks/ses` is
   reachable (a plain GET/empty POST returns 400/403 — that's fine, it's alive).
2. **Deploy the stack**:
   ```bash
   aws cloudformation deploy --region us-east-1 \
     --stack-name tiffin-grab-ses-suppression \
     --template-file deployment/email/ses-suppression.yaml
   ```
   Creating the subscription POSTs a `SubscriptionConfirmation`; the route
   auto-confirms it. Verify: `aws sns list-subscriptions-by-topic --topic-arn <FeedbackTopicArn>`
   shows a real SubscriptionArn (not `PendingConfirmation`).
3. **Point sends at the config set** so events flow:
   ```bash
   aws ssm put-parameter --region us-east-1 --overwrite \
     --name /tiffin-grab/prod/SES_CONFIGURATION_SET --type String \
     --value tiffin-grab-prod
   # optional defense-in-depth for the webhook:
   aws ssm put-parameter --region us-east-1 --overwrite \
     --name /tiffin-grab/prod/SES_FEEDBACK_TOPIC_ARN --type String --value <FeedbackTopicArn>
   ```
   Then redeploy the app (box: `cd ~/realm/deployment/prod/tiffin-grab && ./deploy.sh`)
   so `getEmailProvider` picks up `SES_CONFIGURATION_SET`.
4. **Verify**: send to `bounce@simulator.amazonses.com` and
   `complaint@simulator.amazonses.com` (SES mailbox simulator — works even in the
   sandbox). Each should flip `notification_prefs.suppressed=true` for a matching
   user (create test users with those addresses first).
