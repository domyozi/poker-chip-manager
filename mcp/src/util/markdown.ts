export function h2(text: string): string {
  return `## ${text}`;
}

export function bullet(text: string): string {
  return `- ${text}`;
}

export function code(text: string): string {
  return `\`${text}\``;
}
