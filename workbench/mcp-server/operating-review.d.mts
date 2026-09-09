import type {ProgressDeal, MappingRow} from '../src/deal-progress';
type Metric=MappingRow&{sourceId:string;sourceDigest:string;availableOn:string};
export const operatingMetrics:string[];
export function validDate(value:unknown):boolean;
export function operatingBasis(deal:ProgressDeal):string;
export function operatingText(deal:ProgressDeal):string[];
export function buildOperatingReview(deal:ProgressDeal):null|{admittedSources:string[];period:string;currency:string;scenario:string;cutoff:string;minimumCash:number;owner:string;basis:string;lines:{metric:string;actual:Metric|null;forecast:Metric|null;delta:number|null;status:string}[];derived:{label:string;actual:number|null;forecast:number|null;delta:number|null;refs:string[];explanation:string}[];concerns:{key:string;question:string;why:string;refs:string[]}[];exclusions:{sourceId:string;reason:string}[]};
export function checkMetricClaim(deal:ProgressDeal,claim:{metric:string;basis:'actual'|'forecast';period:string;currency:string;scenario:string;ref:string;value:number}):{grade:string;reason:string};
