# Architecture

## System

The application is split into a web app, server APIs, provider adapters, deterministic analytics, and background workers. The first release keeps the runtime inside the Next.js app for the user-facing surfaces and isolates market-data and AI access behind abstractions so those subsystems can move to workers later without changing the UI.

## Frontend

Next.js App Router is used because it supports server components, route handlers, streaming, and clean separation between pages and client-only charting components. Tailwind and a small internal UI layer keep the workstation dense and fast.

## Backend

Backend functionality begins with route handlers and shared server modules. This keeps the first release simple while still allowing later extraction to dedicated services for long-running tasks.

## Database

PostgreSQL is the source of truth. Drizzle schema files define the entities, constraints, and indexes required for market history, analytics, journal data, alerts, and execution records.

## Market Data

Market data is accessed through a `MarketDataProvider` interface with normalized responses. This prevents provider-specific code from leaking into the app and allows offline, delayed, and connected states to be represented explicitly.

## AI

AI is treated as an adapter layer that consumes structured facts only. The system never lets an AI provider calculate core indicators or invent data. If no AI provider is configured, the UI shows `NOT CONNECTED`.

## Quant

Technical indicators, market structure, support/resistance, setup scoring, and risk calculations are deterministic pure functions. That makes results reproducible and auditable.

## Workers

The first release does not require persistent workers, but the module boundaries are laid out so backtests, scanning, and ingestion can later move to Dockerized workers or scheduled jobs.

## Deployment

The web app is Vercel-friendly. PostgreSQL can be Supabase or managed Postgres. Workers can run separately when long-running tasks are introduced.

## Security

Secrets stay server-side in environment variables. Provider access is read-only in release 1. No withdrawal or execution permissions are introduced.

## Testing

Vitest covers deterministic analytics, provider normalization, and health/status logic. The target is to keep every core calculation reproducible and every external integration failure-safe.
