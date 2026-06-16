import { fetchAPI } from './api'

export interface ForecastStage {
  count: number
  totalValue: number
  weightedValue: number
}

export interface ForecastMonth {
  label: string
  weighted: number
  count: number
}

export interface ForecastTopDeal {
  id: string
  title: string
  value: number
  probability: number
  status: string
  stage: string
}

export interface ForecastData {
  totalValue: number
  weightedValue: number
  totalDeals: number
  byStage: Record<string, ForecastStage>
  forecast3Months: ForecastMonth[]
  topDeals: ForecastTopDeal[]
}

export const getPipelineForecast = (): Promise<ForecastData> =>
  fetchAPI('/crm/pipeline/forecast')
