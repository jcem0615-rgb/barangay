/**
 * Which build of the app this is.
 *
 * Three facts, stamped in by `vite.config.ts` at build time, answering one
 * question: **is the thing on this screen the thing that was last deployed?**
 *
 * That question is not idle here. `registerType: 'autoUpdate'` installs a new
 * service worker in the background, so a returning visitor can be looking at
 * the *previous* precached shell while the new one waits behind it — which is
 * how a deployed change sat live for half a day and still looked missing,
 * twice, before `swUpdate.ts` existed. See *Getting a new version onto a
 * phone* in CLAUDE.md. A version printed on the screen is what makes that
 * diagnosable from a photograph of somebody's phone.
 *
 * **The commit is the part that cannot go stale.** `version` is semver and
 * moves when a person decides it does; `commit` moves on every single deploy
 * whether anybody remembered or not, which is why it is shown beside the
 * version rather than hidden behind it.
 */

declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
declare const __APP_BUILT_AT__: string

export const APP_VERSION = __APP_VERSION__
export const APP_COMMIT = __APP_COMMIT__
export const APP_BUILT_AT = __APP_BUILT_AT__

/**
 * The one-line form: `v0.2.0 · bfb5877 · 2 Nov 2026`.
 *
 * Takes `locale` as a **required** argument rather than defaulting it, for the
 * reason `formatReadyRange` had to be changed: a defaulted locale compiles at
 * every call site and is passed at none, and the date then prints in English
 * in the middle of a Filipino screen. `check:i18n` fails a defaulted one.
 */
export function versionLine(locale: string): string {
  const built = new Date(APP_BUILT_AT)
  const date = Number.isNaN(built.getTime())
    ? APP_BUILT_AT
    : built.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  return `v${APP_VERSION} · ${APP_COMMIT} · ${date}`
}
