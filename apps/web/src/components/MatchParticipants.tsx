import { ComponentPropsWithoutRef, ElementType } from 'react';
import PlayerName, { PlayerInfo } from './PlayerName';
import { resolveText } from '../lib/text';

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
  const visualSeparator = ` ${resolveText(separatorSymbol, '&')} `;
  const visualVersus = ` ${resolveText(versusSymbol, 'vs')} `;
  const separatorScreenReaderText = resolveText(separatorLabel, 'and');
  const versusScreenReaderText = resolveText(versusLabel, 'versus');

  if (!sides.length) {
    return <Component className={classes} {...rest} />;
  }

  return (
    <Component className={classes} {...rest}>
      {sides.map((side, sideIndex) => {
        const renderedSide: Array<JSX.Element> = [];

        side.forEach((player, playerIndex) => {
          if (playerIndex === 0) {
            renderedSide.push(
              <span key={player.id} className="match-participants__entry">
                <PlayerName player={player} />
              </span>
            );
            return;
          }

          renderedSide.push(
            <span
              key={`${player.id}-group-${playerIndex}`}
              className="match-participants__entry-group"
            >
              <span
                className="match-participants__separator"
                aria-label={separatorScreenReaderText}
              >
                {visualSeparator}
              </span>
              <span className="match-participants__entry">
                <PlayerName player={player} />
              </span>
            </span>
          );
        });

        return (
          <span key={sideIndex} className="match-participants__side-wrapper">
            {sideIndex > 0 && (
              <>
                <span
                  className="match-participants__versus"
                  aria-label={versusScreenReaderText}
                >
                  {visualVersus}
                </span>
              </>
            )}
            <span className="match-participants__side">{renderedSide}</span>
          </span>
        );
      })}
    </Component>
  );
}
