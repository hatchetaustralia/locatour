// Ambient declaration so TypeScript accepts CSS-module imports (web only).
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
