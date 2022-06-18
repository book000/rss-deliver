import CollectResult from './model/collect-result'
import ServiceInformation from './model/service-information'

export abstract class BaseService {
  abstract information(): ServiceInformation

  abstract collect(): Promise<CollectResult>
}
