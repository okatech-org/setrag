/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as betterAuth_auth from "../betterAuth/auth.js";
import type * as crons from "../crons.js";
import type * as functions_bookings from "../functions/bookings.js";
import type * as functions_maintenance from "../functions/maintenance.js";
import type * as functions_stations from "../functions/stations.js";
import type * as functions_tickets from "../functions/tickets.js";
import type * as functions_trips from "../functions/trips.js";
import type * as functions_users from "../functions/users.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as seeds_seed from "../seeds/seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "betterAuth/auth": typeof betterAuth_auth;
  crons: typeof crons;
  "functions/bookings": typeof functions_bookings;
  "functions/maintenance": typeof functions_maintenance;
  "functions/stations": typeof functions_stations;
  "functions/tickets": typeof functions_tickets;
  "functions/trips": typeof functions_trips;
  "functions/users": typeof functions_users;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "seeds/seed": typeof seeds_seed;
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
  bookingsByTrip: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"bookingsByTrip">;
  bookingsByStatus: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"bookingsByStatus">;
  ticketsByTrip: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"ticketsByTrip">;
  revenueByDay: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"revenueByDay">;
};
