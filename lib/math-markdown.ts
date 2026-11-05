/** Normalize common model math delimiters without changing code examples. */
export function normalizeMathMarkdown(source:string):string {
  return source.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part,index)=>index%2?part:part
    .replace(/\\\[([\s\S]*?)\\\]/g,(_,formula:string)=>`\n$$\n${formula.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g,(_,formula:string)=>`$${formula}$`)).join('');
}
