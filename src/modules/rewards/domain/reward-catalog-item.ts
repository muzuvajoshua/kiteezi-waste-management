import { RewardUnavailableError } from './errors';

export interface RewardCatalogItemProps {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly costPoints: number;
  readonly isAvailable: boolean;
}

// Thin wrapper over a reward_catalog row. The only behavior worth protecting
// today is "can this actually be redeemed" — everything else is a plain,
// already-validated read.
export class RewardCatalogItem {
  private constructor(private readonly props: RewardCatalogItemProps) {}

  static from(props: RewardCatalogItemProps): RewardCatalogItem {
    return new RewardCatalogItem(props);
  }

  get id(): number {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | null {
    return this.props.description;
  }

  get costPoints(): number {
    return this.props.costPoints;
  }

  get isAvailable(): boolean {
    return this.props.isAvailable;
  }

  assertRedeemable(): void {
    if (!this.props.isAvailable) {
      throw new RewardUnavailableError();
    }
  }
}
