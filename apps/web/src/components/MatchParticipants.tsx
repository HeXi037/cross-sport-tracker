import { ComponentPropsWithoutRef, ElementType } from 'react';
import PlayerName, { PlayerInfo } from './PlayerName';

type BaseProps = {
  sides: PlayerInfo[][];
  separatorLabel?: string;
  versusLabel?: string;
  separatorSymbol?: string;
  versusSymbol?: string;
  className?: string;
};

type MatchParticipantsProps<T extends ElementType> = BaseProps &
  Omit<ComponentPropsWithoutRef<T>, keyof BaseProps | 'as'> & {
    as?: T;
  };

const DEFAULT_ELEMENT = 'div';

export default function MatchParticipants<
  T extends ElementType = typeof DEFAULT_ELEMENT
>({
  as,
  sides,
  separatorLabel,
  versusLabel,
  separatorSymbol = '&',
  versusSymbol = 'vs',
  className,
  ...rest
}: MatchParticipantsProps<T>) {
  const Component = (as ?? DEFAULT_ELEMENT) as ElementType;
  const classes = ['match-participants', className].filter(Boolean).join(' ');

  if (!sides.length) {
    return <Component className={classes} {...rest} />;
  }

  return (
    <Component className={classes} {...rest}>
      {sides.map((side, sideIndex) => (
        <span key={sideIndex} className="match-participants__side-wrapper">
          {sideIndex > 0 && (
            <span
              className="match-participants__versus"
              aria-label={versusLabel || undefined}
            >
              {` ${versusSymbol} `}
            </span>
          )}
          <span className="match-participants__side">
            {side.map((player, playerIndex) => (
              <span key={player.id} className="match-participants__entry">
                {playerIndex > 0 && (
                  <span
                    className="match-participants__separator"
                    aria-label={separatorLabel || undefined}
                  >
                    {` ${separatorSymbol} `}
                  </span>
                )}
                <PlayerName player={player} />
              </span>
            ))}
          </span>
        </span>
      ))}
    </Component>
  );
}
