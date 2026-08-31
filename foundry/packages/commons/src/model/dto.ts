export interface BaseDTO {
  id: string;
  createdAt: Date;
  createdBy: string | null;
}

export interface UpdatableDTO extends BaseDTO {
  updatedAt: Date;
  updatedBy: string | null;
}
