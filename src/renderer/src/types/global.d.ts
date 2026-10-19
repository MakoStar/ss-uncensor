declare module '*.css'

declare global {
  interface Element {
    value: any
    checked: any
    dataset: any
    click(): void
    closest(selector: string): any
  }

  interface EventTarget {
    closest(selector: string): any
  }
}

export {}
