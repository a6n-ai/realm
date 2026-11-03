/** Browser/request context captured on the customer's own request (checkout), not a webhook. */
export type MetaAttribution = {
  clientIpAddress?: string;
  clientUserAgent?: string;
  fbp?: string;
  fbc?: string;
  eventSourceUrl?: string;
  /** false when the buyer had not accepted analytics/ads cookies: no Purchase is sent for the order. */
  consent?: boolean;
};

export type MetaUserDataInput = {
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  externalId?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

export type MetaCustomData = {
  value?: number;
  currency?: string;
  content_ids?: string[];
  content_type?: string;
  content_name?: string;
  num_items?: number;
  /** Hashed postal is built server-side; this is the raw postal for FindLocation zp. */
  postalCode?: string;
};

export type MetaEventName = "ViewContent" | "AddToCart" | "Purchase" | "Contact" | "FindLocation" | "PageView";

export type SendMetaEventArgs = {
  eventName: MetaEventName;
  eventId: string;
  eventSourceUrl?: string | null;
  eventTime?: number;
  userData: MetaUserDataInput;
  customData?: MetaCustomData;
};
