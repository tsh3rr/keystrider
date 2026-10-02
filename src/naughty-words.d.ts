declare module 'naughty-words' {
  /** LDNOOBW lists, keyed by language tag. */
  const lists: Readonly<Record<string, readonly string[]>>;
  export default lists;
}
