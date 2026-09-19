/**
 * Mobin Panel — asset module declarations
 * Created by Mobin.A
 *
 * The esbuild `inline-assets` plugin resolves `~public/<path>` imports to
 * files under ./public and loads them as raw text strings.
 */
declare module '~public/*' {
  const content: string;
  export default content;
}
