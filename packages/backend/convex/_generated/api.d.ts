/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_chat from "../ai/chat.js";
import type * as ai_contracts from "../ai/contracts.js";
import type * as ai_conversations from "../ai/conversations.js";
import type * as ai_providers from "../ai/providers.js";
import type * as ai_rateLimiter from "../ai/rateLimiter.js";
import type * as ai_realtime from "../ai/realtime.js";
import type * as ai_tools from "../ai/tools.js";
import type * as betterAuth_auth from "../betterAuth/auth.js";
import type * as crons from "../crons.js";
import type * as functions_accounting from "../functions/accounting.js";
import type * as functions_ancillaries from "../functions/ancillaries.js";
import type * as functions_bookings from "../functions/bookings.js";
import type * as functions_booklets from "../functions/booklets.js";
import type * as functions_cash from "../functions/cash.js";
import type * as functions_control from "../functions/control.js";
import type * as functions_customers from "../functions/customers.js";
import type * as functions_devAuth from "../functions/devAuth.js";
import type * as functions_documents from "../functions/documents.js";
import type * as functions_manualSales from "../functions/manualSales.js";
import type * as functions_monitoring from "../functions/monitoring.js";
import type * as functions_notificationCenter from "../functions/notificationCenter.js";
import type * as functions_notificationLog from "../functions/notificationLog.js";
import type * as functions_notifications from "../functions/notifications.js";
import type * as functions_referential from "../functions/referential.js";
import type * as functions_reportSchedules from "../functions/reportSchedules.js";
import type * as functions_reporting from "../functions/reporting.js";
import type * as functions_rollup from "../functions/rollup.js";
import type * as functions_sales from "../functions/sales.js";
import type * as functions_trips from "../functions/trips.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_aztecRender from "../lib/aztecRender.js";
import type * as lib_resend from "../lib/resend.js";
import type * as lib_saleContext from "../lib/saleContext.js";
import type * as lib_signature from "../lib/signature.js";
import type * as lib_ticketPdf from "../lib/ticketPdf.js";
import type * as lib_tripQuote from "../lib/tripQuote.js";
import type * as messaging_contracts from "../messaging/contracts.js";
import type * as messaging_core from "../messaging/core.js";
import type * as messaging_dispatch from "../messaging/dispatch.js";
import type * as messaging_orchestrator from "../messaging/orchestrator.js";
import type * as messaging_telegram from "../messaging/telegram.js";
import type * as model_accounting from "../model/accounting.js";
import type * as model_ancillary from "../model/ancillary.js";
import type * as model_approval from "../model/approval.js";
import type * as model_aztec from "../model/aztec.js";
import type * as model_barcode from "../model/barcode.js";
import type * as model_calendar from "../model/calendar.js";
import type * as model_fares from "../model/fares.js";
import type * as model_inventory from "../model/inventory.js";
import type * as model_kpi from "../model/kpi.js";
import type * as model_network from "../model/network.js";
import type * as model_permissions from "../model/permissions.js";
import type * as model_pricing from "../model/pricing.js";
import type * as model_sales from "../model/sales.js";
import type * as model_seating from "../model/seating.js";
import type * as model_supervision from "../model/supervision.js";
import type * as seeds_demo from "../seeds/demo.js";
import type * as seeds_history from "../seeds/history.js";
import type * as seeds_provisionalFares from "../seeds/provisionalFares.js";
import type * as seeds_referential from "../seeds/referential.js";
import type * as testing from "../testing.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/chat": typeof ai_chat;
  "ai/contracts": typeof ai_contracts;
  "ai/conversations": typeof ai_conversations;
  "ai/providers": typeof ai_providers;
  "ai/rateLimiter": typeof ai_rateLimiter;
  "ai/realtime": typeof ai_realtime;
  "ai/tools": typeof ai_tools;
  "betterAuth/auth": typeof betterAuth_auth;
  crons: typeof crons;
  "functions/accounting": typeof functions_accounting;
  "functions/ancillaries": typeof functions_ancillaries;
  "functions/bookings": typeof functions_bookings;
  "functions/booklets": typeof functions_booklets;
  "functions/cash": typeof functions_cash;
  "functions/control": typeof functions_control;
  "functions/customers": typeof functions_customers;
  "functions/devAuth": typeof functions_devAuth;
  "functions/documents": typeof functions_documents;
  "functions/manualSales": typeof functions_manualSales;
  "functions/monitoring": typeof functions_monitoring;
  "functions/notificationCenter": typeof functions_notificationCenter;
  "functions/notificationLog": typeof functions_notificationLog;
  "functions/notifications": typeof functions_notifications;
  "functions/referential": typeof functions_referential;
  "functions/reportSchedules": typeof functions_reportSchedules;
  "functions/reporting": typeof functions_reporting;
  "functions/rollup": typeof functions_rollup;
  "functions/sales": typeof functions_sales;
  "functions/trips": typeof functions_trips;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/aztecRender": typeof lib_aztecRender;
  "lib/resend": typeof lib_resend;
  "lib/saleContext": typeof lib_saleContext;
  "lib/signature": typeof lib_signature;
  "lib/ticketPdf": typeof lib_ticketPdf;
  "lib/tripQuote": typeof lib_tripQuote;
  "messaging/contracts": typeof messaging_contracts;
  "messaging/core": typeof messaging_core;
  "messaging/dispatch": typeof messaging_dispatch;
  "messaging/orchestrator": typeof messaging_orchestrator;
  "messaging/telegram": typeof messaging_telegram;
  "model/accounting": typeof model_accounting;
  "model/ancillary": typeof model_ancillary;
  "model/approval": typeof model_approval;
  "model/aztec": typeof model_aztec;
  "model/barcode": typeof model_barcode;
  "model/calendar": typeof model_calendar;
  "model/fares": typeof model_fares;
  "model/inventory": typeof model_inventory;
  "model/kpi": typeof model_kpi;
  "model/network": typeof model_network;
  "model/permissions": typeof model_permissions;
  "model/pricing": typeof model_pricing;
  "model/sales": typeof model_sales;
  "model/seating": typeof model_seating;
  "model/supervision": typeof model_supervision;
  "seeds/demo": typeof seeds_demo;
  "seeds/history": typeof seeds_history;
  "seeds/provisionalFares": typeof seeds_provisionalFares;
  "seeds/referential": typeof seeds_referential;
  testing: typeof testing;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  salesByDay: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"salesByDay">;
  salesByPointOfSale: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"salesByPointOfSale">;
  ticketsByTrip: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"ticketsByTrip">;
  revenueByTrip: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"revenueByTrip">;
};
