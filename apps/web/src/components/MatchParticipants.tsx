import type { ComponentPropsWithoutRef, ElementType, ReactElement } from 'react';
import PlayerName, { type PlayerInfo } from './PlayerName';

type MatchParticipantsProps<E extends ElementType> = {
  /**
   * Ordered list of sides. Each side is rendered in sequence with the
   * configured separators. The component assumes the players are already in
   * the desired display order.
   */
  sides: PlayerInfo[][];
  /**
   * Allows overriding the root element (defaults to a <div>). Useful when the
   * participants need to be displayed inside inline contexts like headings.
   */
  as?: E;
  className?: string;
  /**
   * Symbol placed between players on the same side.
   */
  playerSeparator?: string;
  /**
   * Symbol placed between opposing sides.
   */
  sideSeparator?: string;
} & Omit<ComponentPropsWithoutRef<E>, 'as' | 'children'>;

const defaultPlayerSeparator = ' & ';
const defaultSideSeparator = ' vs ';

export default function MatchParticipants<E extends ElementType = 'div'>(
  props: MatchParticipantsProps<E>,
): ReactElement {
  const {
    as,
    className,
    sides,
    playerSeparator = defaultPlayerSeparator,
    sideSeparator = defaultSideSeparator,
    ...rest
  } = props;

  const Component = (as ?? 'div') as ElementType;
  const classes = ['match-participants'];
  if (className) classes.push(className);

  return (
    <Component className={classes.join(' ')} {...rest}>
      {sides.map((side, sideIndex) => (
        <span key={`side-${sideIndex}`} className="match-participants__side-wrapper">
          <span className="match-participants__side">
            {side.map((player, playerIndex) => (
              <span key={player.id} className="match-participants__entry">
                {playerIndex > 0 ? (
                  <span className="match-participants__separator">
                    {playerSeparator}
                  </span>
                ) : null}
                <PlayerName player={player} />
              </span>
            ))}
          </span>
          {sideIndex < sides.length - 1 ? (
            <span className="match-participants__versus">{sideSeparator}</span>
          ) : null}
        </span>
      ))}
    </Component>
  );
}
