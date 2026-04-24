declare module "react-plotly.js" {
  import type { ComponentType, CSSProperties } from "react"
  import type { Config, Data, Layout, PlotMouseEvent } from "plotly.js"

  export type PlotParams = {
    data?: Data[]
    layout?: Partial<Layout>
    config?: Partial<Config>
    frames?: unknown[]
    divId?: string
    className?: string
    style?: CSSProperties
    useResizeHandler?: boolean
    debug?: boolean
    onClick?: (event: PlotMouseEvent) => void
    onInitialized?: (figure: unknown, graphDiv: HTMLElement) => void
    onUpdate?: (figure: unknown, graphDiv: HTMLElement) => void
    onPurge?: (figure: unknown, graphDiv: HTMLElement) => void
    onError?: (error: Error) => void
  }

  const Plot: ComponentType<PlotParams>

  export default Plot
}
