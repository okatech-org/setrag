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
import type * as betterAuth_origins from "../betterAuth/origins.js";
import type * as crons from "../crons.js";
import type * as functions_accounting from "../functions/accounting.js";
import type * as functions_administration from "../functions/administration.js";
import type * as functions_ancillaries from "../functions/ancillaries.js";
import type * as functions_bookings from "../functions/bookings.js";
import type * as functions_booklets from "../functions/booklets.js";
import type * as functions_cash from "../functions/cash.js";
import type * as functions_control from "../functions/control.js";
import type * as functions_customers from "../functions/customers.js";
import type * as functions_demoAccounts from "../functions/demoAccounts.js";
import type * as functions_devAuth from "../functions/devAuth.js";
import type * as functions_documents from "../functions/documents.js";
import type * as functions_fareSchedules from "../functions/fareSchedules.js";
import type * as functions_management from "../functions/management.js";
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
import type * as functions_wallet from "../functions/wallet.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_aztecRender from "../lib/aztecRender.js";
import type * as lib_resend from "../lib/resend.js";
import type * as lib_saleContext from "../lib/saleContext.js";
import type * as lib_signature from "../lib/signature.js";
import type * as lib_ticketPdf from "../lib/ticketPdf.js";
import type * as lib_tripQuote from "../lib/tripQuote.js";
import type * as lib_walletPass from "../lib/walletPass.js";
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
import type * as model_demoPersonas from "../model/demoPersonas.js";
import type * as model_fares from "../model/fares.js";
import type * as model_inventory from "../model/inventory.js";
import type * as model_kpi from "../model/kpi.js";
import type * as model_network from "../model/network.js";
import type * as model_permissions from "../model/permissions.js";
import type * as model_pricing from "../model/pricing.js";
import type * as model_sales from "../model/sales.js";
import type * as model_seating from "../model/seating.js";
import type * as model_supervision from "../model/supervision.js";
import type * as modules_continuity_model from "../modules/continuity/model.js";
import type * as modules_continuity_mutations from "../modules/continuity/mutations.js";
import type * as modules_continuity_queries from "../modules/continuity/queries.js";
import type * as modules_continuity_tables from "../modules/continuity/tables.js";
import type * as modules_cotraf_model from "../modules/cotraf/model.js";
import type * as modules_cotraf_permissions from "../modules/cotraf/permissions.js";
import type * as modules_cotraf_queries from "../modules/cotraf/queries.js";
import type * as modules_cotraf_tables from "../modules/cotraf/tables.js";
import type * as modules_finance_model from "../modules/finance/model.js";
import type * as modules_finance_mutations from "../modules/finance/mutations.js";
import type * as modules_finance_queries from "../modules/finance/queries.js";
import type * as modules_finance_tables from "../modules/finance/tables.js";
import type * as modules_fret_manifest from "../modules/fret/manifest.js";
import type * as modules_fret_model from "../modules/fret/model.js";
import type * as modules_fret_permissions from "../modules/fret/permissions.js";
import type * as modules_fret_queries from "../modules/fret/queries.js";
import type * as modules_fret_tables from "../modules/fret/tables.js";
import type * as modules_platform_approvalModel from "../modules/platform/approvalModel.js";
import type * as modules_platform_approvals from "../modules/platform/approvals.js";
import type * as modules_platform_audit from "../modules/platform/audit.js";
import type * as modules_platform_catalog from "../modules/platform/catalog.js";
import type * as modules_platform_documentModel from "../modules/platform/documentModel.js";
import type * as modules_platform_documents from "../modules/platform/documents.js";
import type * as modules_platform_environment from "../modules/platform/environment.js";
import type * as modules_platform_integration from "../modules/platform/integration.js";
import type * as modules_platform_integrationModel from "../modules/platform/integrationModel.js";
import type * as modules_platform_model from "../modules/platform/model.js";
import type * as modules_platform_mutations from "../modules/platform/mutations.js";
import type * as modules_platform_queries from "../modules/platform/queries.js";
import type * as modules_platform_tables from "../modules/platform/tables.js";
import type * as modules_platform_validators from "../modules/platform/validators.js";
import type * as seeds_controlDemo from "../seeds/controlDemo.js";
import type * as seeds_cotrafDemo from "../seeds/cotrafDemo.js";
import type * as seeds_demo from "../seeds/demo.js";
import type * as seeds_demoAccounts from "../seeds/demoAccounts.js";
import type * as seeds_enterpriseDemo from "../seeds/enterpriseDemo.js";
import type * as seeds_fretDemo from "../seeds/fretDemo.js";
import type * as seeds_history from "../seeds/history.js";
import type * as seeds_provisionalFares from "../seeds/provisionalFares.js";
import type * as seeds_referential from "../seeds/referential.js";
import type * as seeds_staffAccounts from "../seeds/staffAccounts.js";
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
  "betterAuth/origins": typeof betterAuth_origins;
  crons: typeof crons;
  "functions/accounting": typeof functions_accounting;
  "functions/administration": typeof functions_administration;
  "functions/ancillaries": typeof functions_ancillaries;
  "functions/bookings": typeof functions_bookings;
  "functions/booklets": typeof functions_booklets;
  "functions/cash": typeof functions_cash;
  "functions/control": typeof functions_control;
  "functions/customers": typeof functions_customers;
  "functions/demoAccounts": typeof functions_demoAccounts;
  "functions/devAuth": typeof functions_devAuth;
  "functions/documents": typeof functions_documents;
  "functions/fareSchedules": typeof functions_fareSchedules;
  "functions/management": typeof functions_management;
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
  "functions/wallet": typeof functions_wallet;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/aztecRender": typeof lib_aztecRender;
  "lib/resend": typeof lib_resend;
  "lib/saleContext": typeof lib_saleContext;
  "lib/signature": typeof lib_signature;
  "lib/ticketPdf": typeof lib_ticketPdf;
  "lib/tripQuote": typeof lib_tripQuote;
  "lib/walletPass": typeof lib_walletPass;
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
  "model/demoPersonas": typeof model_demoPersonas;
  "model/fares": typeof model_fares;
  "model/inventory": typeof model_inventory;
  "model/kpi": typeof model_kpi;
  "model/network": typeof model_network;
  "model/permissions": typeof model_permissions;
  "model/pricing": typeof model_pricing;
  "model/sales": typeof model_sales;
  "model/seating": typeof model_seating;
  "model/supervision": typeof model_supervision;
  "modules/continuity/model": typeof modules_continuity_model;
  "modules/continuity/mutations": typeof modules_continuity_mutations;
  "modules/continuity/queries": typeof modules_continuity_queries;
  "modules/continuity/tables": typeof modules_continuity_tables;
  "modules/cotraf/model": typeof modules_cotraf_model;
  "modules/cotraf/permissions": typeof modules_cotraf_permissions;
  "modules/cotraf/queries": typeof modules_cotraf_queries;
  "modules/cotraf/tables": typeof modules_cotraf_tables;
  "modules/finance/model": typeof modules_finance_model;
  "modules/finance/mutations": typeof modules_finance_mutations;
  "modules/finance/queries": typeof modules_finance_queries;
  "modules/finance/tables": typeof modules_finance_tables;
  "modules/fret/manifest": typeof modules_fret_manifest;
  "modules/fret/model": typeof modules_fret_model;
  "modules/fret/permissions": typeof modules_fret_permissions;
  "modules/fret/queries": typeof modules_fret_queries;
  "modules/fret/tables": typeof modules_fret_tables;
  "modules/platform/approvalModel": typeof modules_platform_approvalModel;
  "modules/platform/approvals": typeof modules_platform_approvals;
  "modules/platform/audit": typeof modules_platform_audit;
  "modules/platform/catalog": typeof modules_platform_catalog;
  "modules/platform/documentModel": typeof modules_platform_documentModel;
  "modules/platform/documents": typeof modules_platform_documents;
  "modules/platform/environment": typeof modules_platform_environment;
  "modules/platform/integration": typeof modules_platform_integration;
  "modules/platform/integrationModel": typeof modules_platform_integrationModel;
  "modules/platform/model": typeof modules_platform_model;
  "modules/platform/mutations": typeof modules_platform_mutations;
  "modules/platform/queries": typeof modules_platform_queries;
  "modules/platform/tables": typeof modules_platform_tables;
  "modules/platform/validators": typeof modules_platform_validators;
  "seeds/controlDemo": typeof seeds_controlDemo;
  "seeds/cotrafDemo": typeof seeds_cotrafDemo;
  "seeds/demo": typeof seeds_demo;
  "seeds/demoAccounts": typeof seeds_demoAccounts;
  "seeds/enterpriseDemo": typeof seeds_enterpriseDemo;
  "seeds/fretDemo": typeof seeds_fretDemo;
  "seeds/history": typeof seeds_history;
  "seeds/provisionalFares": typeof seeds_provisionalFares;
  "seeds/referential": typeof seeds_referential;
  "seeds/staffAccounts": typeof seeds_staffAccounts;
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
