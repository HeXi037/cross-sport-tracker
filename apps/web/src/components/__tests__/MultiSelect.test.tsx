import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import MultiSelect from '../MultiSelect';

describe('MultiSelect', () => {
  const renderComponent = (
    options: { id: string; name: string }[],
    initialSelected: string[] = []
  ): HTMLElement => {
    function Wrapper() {
      const [selected, setSelected] = useState(initialSelected);
      return (
        <MultiSelect
          ariaLabel="Available players"
          id="players"
          options={options}
          searchLabel="Search players"
          selectedIds={selected}
          selectedSummaryLabel={`${selected.length} player${selected.length === 1 ? '' : 's'} selected`}
          onSelectionChange={setSelected}
        />
      );
    }

    render(<Wrapper />);
    return screen.getByRole('listbox', { name: 'Available players' });
  };

  it('supports keyboard navigation, selection, and deselection', async () => {
    const options = [
      { id: 'p1', name: 'Ava' },
      { id: 'p2', name: 'Ben' },
      { id: 'p3', name: 'Cora' },
      { id: 'p4', name: 'Drew' },
    ];

    renderComponent(options);

    const user = userEvent.setup();
    const searchInput = screen.getByLabelText('Search players');

    await user.click(searchInput);

    await user.keyboard('{ArrowDown}{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');

    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    expect(removeButtons).toHaveLength(3);

    await user.keyboard('{ArrowUp}{Enter}');

    const remainingButtons = screen.getAllByRole('button', { name: /remove/i });
    expect(remainingButtons).toHaveLength(2);
    expect(screen.getByText('Ava')).toBeInTheDocument();
    expect(screen.getByText('Cora')).toBeInTheDocument();

    await user.keyboard('{Backspace}');

    const chips = screen.getAllByRole('button', { name: /remove/i });
    expect(chips).toHaveLength(1);
    expect(screen.getByText('Ava')).toBeInTheDocument();
  });

  it('filters options and virtualizes long lists to stay responsive', async () => {
    const options = Array.from({ length: 50 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    }));

    const listbox = renderComponent(options);

    const user = userEvent.setup();
    const initialOptions = within(listbox).getAllByRole('option');
    expect(initialOptions.length).toBeLessThan(options.length);

    listbox.scrollTop = 400;
    fireEvent.scroll(listbox);

    const searchInput = screen.getByLabelText('Search players');
    await user.type(searchInput, 'Player 17');

    await screen.findByText('Player 17');
    expect(within(listbox).getAllByRole('option')).toHaveLength(1);
    await user.clear(searchInput);
    await user.type(searchInput, 'zzz');
    expect(await screen.findByText(/No results for "zzz"/i)).toBeInTheDocument();
    await waitFor(() => expect(listbox.scrollTop).toBe(0));
  });
});
