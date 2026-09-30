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
import type * as ai_flux from "../ai/flux.js";
import type * as ai_memory from "../ai/memory.js";
import type * as ai_providers from "../ai/providers.js";
import type * as ai_rateLimiter from "../ai/rateLimiter.js";
import type * as ai_realtime from "../ai/realtime.js";
import type * as ai_rejeu from "../ai/rejeu.js";
import type * as ai_tools from "../ai/tools.js";
import type * as betterAuth_auth from "../betterAuth/auth.js";
import type * as betterAuth_effacement from "../betterAuth/effacement.js";
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
import type * as lib_courriels from "../lib/courriels.js";
import type * as lib_horaires from "../lib/horaires.js";
import type * as lib_libellesBillet from "../lib/libellesBillet.js";
import type * as lib_pdfMarque from "../lib/pdfMarque.js";
import type * as lib_polices from "../lib/polices.js";
import type * as lib_policesDonnees from "../lib/policesDonnees.js";
import type * as lib_resend from "../lib/resend.js";
import type * as lib_saleContext from "../lib/saleContext.js";
import type * as lib_signature from "../lib/signature.js";
import type * as lib_ticketPdf from "../lib/ticketPdf.js";
import type * as lib_tripQuote from "../lib/tripQuote.js";
import type * as lib_walletImages from "../lib/walletImages.js";
import type * as lib_walletPass from "../lib/walletPass.js";
import type * as messaging_contracts from "../messaging/contracts.js";
import type * as messaging_core from "../messaging/core.js";
import type * as messaging_dispatch from "../messaging/dispatch.js";
import type * as messaging_linking from "../messaging/linking.js";
import type * as messaging_orchestrator from "../messaging/orchestrator.js";
import type * as messaging_telegram from "../messaging/telegram.js";
import type * as model_accounting from "../model/accounting.js";
import type * as model_ancillary from "../model/ancillary.js";
import type * as model_approval from "../model/approval.js";
import type * as model_aztec from "../model/aztec.js";
import type * as model_barcode from "../model/barcode.js";
import type * as model_calendar from "../model/calendar.js";
import type * as model_cgv from "../model/cgv.js";
import type * as model_fares from "../model/fares.js";
import type * as model_inventory from "../model/inventory.js";
import type * as model_kpi from "../model/kpi.js";
import type * as model_memoire from "../model/memoire.js";
import type * as model_network from "../model/network.js";
import type * as model_permissions from "../model/permissions.js";
import type * as model_pricing from "../model/pricing.js";
import type * as model_sales from "../model/sales.js";
import type * as model_seating from "../model/seating.js";
import type * as model_supervision from "../model/supervision.js";
import type * as model_telephone from "../model/telephone.js";
import type * as model_titulaire from "../model/titulaire.js";
import type * as seeds_controlDemo from "../seeds/controlDemo.js";
import type * as seeds_demo from "../seeds/demo.js";
import type * as seeds_demoAccounts from "../seeds/demoAccounts.js";
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
  "ai/flux": typeof ai_flux;
  "ai/memory": typeof ai_memory;
  "ai/providers": typeof ai_providers;
  "ai/rateLimiter": typeof ai_rateLimiter;
  "ai/realtime": typeof ai_realtime;
  "ai/rejeu": typeof ai_rejeu;
  "ai/tools": typeof ai_tools;
  "betterAuth/auth": typeof betterAuth_auth;
  "betterAuth/effacement": typeof betterAuth_effacement;
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
  "lib/courriels": typeof lib_courriels;
  "lib/horaires": typeof lib_horaires;
  "lib/libellesBillet": typeof lib_libellesBillet;
  "lib/pdfMarque": typeof lib_pdfMarque;
  "lib/polices": typeof lib_polices;
  "lib/policesDonnees": typeof lib_policesDonnees;
  "lib/resend": typeof lib_resend;
  "lib/saleContext": typeof lib_saleContext;
  "lib/signature": typeof lib_signature;
  "lib/ticketPdf": typeof lib_ticketPdf;
  "lib/tripQuote": typeof lib_tripQuote;
  "lib/walletImages": typeof lib_walletImages;
  "lib/walletPass": typeof lib_walletPass;
  "messaging/contracts": typeof messaging_contracts;
  "messaging/core": typeof messaging_core;
  "messaging/dispatch": typeof messaging_dispatch;
  "messaging/linking": typeof messaging_linking;
  "messaging/orchestrator": typeof messaging_orchestrator;
  "messaging/telegram": typeof messaging_telegram;
  "model/accounting": typeof model_accounting;
  "model/ancillary": typeof model_ancillary;
  "model/approval": typeof model_approval;
  "model/aztec": typeof model_aztec;
  "model/barcode": typeof model_barcode;
  "model/calendar": typeof model_calendar;
  "model/cgv": typeof model_cgv;
  "model/fares": typeof model_fares;
  "model/inventory": typeof model_inventory;
  "model/kpi": typeof model_kpi;
  "model/memoire": typeof model_memoire;
  "model/network": typeof model_network;
  "model/permissions": typeof model_permissions;
  "model/pricing": typeof model_pricing;
  "model/sales": typeof model_sales;
  "model/seating": typeof model_seating;
  "model/supervision": typeof model_supervision;
  "model/telephone": typeof model_telephone;
  "model/titulaire": typeof model_titulaire;
  "seeds/controlDemo": typeof seeds_controlDemo;
  "seeds/demo": typeof seeds_demo;
  "seeds/demoAccounts": typeof seeds_demoAccounts;
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
