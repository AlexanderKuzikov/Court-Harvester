/**
 * Типы данных для API DaData (Справочник судов)
 * Основано на документации: https://dadata.ru/api/suggest/court/
 */

export type CourtType =
  | 'RS' // Районный, городской, межрайонный суд
  | 'MS' // Мировой суд
  | 'AS' // Арбитражный суд субъекта
  | 'AA' // Арбитражный апелляционный суд
  | 'AO' // Арбитражный суд округа
  | 'AI' // Суд по интеллектуальным правам
  | 'VS' // Верховный Суд РФ
  | 'KJ' // Кассационный суд общей юрисдикции
  | 'AJ' // Апелляционный суд общей юрисдикции
  | 'GV' // Гарнизонный военный суд
  | 'KV' // Кассационный военный суд
  | 'AV' // Апелляционный военный суд
  | 'OV' // Окружной (флотский) военный суд
  | 'OS'; // Областной и равный ему суд

export interface CourtData {
  /** Уникальный код суда (59RS0001, А50, 59MS0022) */
  code: string;
  
  /** Полное наименование */
  name: string;
  
  /** ИНН (может быть null для мировых судей) */
  inn: string | null;
  
  /** Код типа суда */
  court_type: CourtType;
  
  /** Расшифровка типа суда */
  court_type_name: string;
  
  /** Фактический адрес */
  address: string;
  
  /** Юридический адрес (может быть null) */
  legal_address: string | null;
  
  /** Ссылка на сайт суда */
  website: string | null;
  
  /** Телефон (не всегда есть в API, но зарезервируем) */
  phone?: string | null;
  
  /** Код региона (извлеченный из code или адреса) */
  region_code?: string;
}

export interface DaDataSuggestion<T> {
  value: string;
  unrestricted_value: string;
  data: T;
}

export interface DaDataResponse<T> {
  suggestions: DaDataSuggestion<T>[];
}

export interface DaDataRequest {
  query: string;
  count?: number; // max 20
  filters?: {
    region_code?: string;
    court_type?: CourtType | CourtType[];
  }[];
  locations?: {
    region_code?: string;
  }[];
}
