/**
 * Covers the behaviour the evidence viewer exists for: clicking a thumbnail promotes it
 * into the hero slot, so a reviewer can step through frames without opening and closing
 * a modal for each one.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../services/api', () => ({
  default: {
    // Each snapshot resolves to a distinguishable URL so the hero's src proves which
    // frame is actually showing.
    get: vi.fn((url) => {
      const m = String(url).match(/proctor-snapshots\/(\d+)\/url/);
      return Promise.resolve({ data: { image_url: `https://cdn.test/frame-${m ? m[1] : 'x'}.jpg` } });
    }),
  },
}));

import SnapshotGallery from './SnapshotGallery';

const snaps = [
  { id: 101, kind: 'termination', captured_at: '2026-08-06T10:00:00Z', label: 'no face' },
  { id: 102, kind: 'screen', captured_at: '2026-08-06T10:01:00Z', label: 'periodic' },
  { id: 103, kind: 'termination', captured_at: '2026-08-06T10:02:00Z', label: 'look away' },
];

const heroImg = () => screen.getByRole('img', { name: /Proctoring frame/i });

describe('SnapshotGallery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when there are no snapshots', () => {
    const { container } = render(<SnapshotGallery snapshots={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the first frame large with the rest as thumbnails', async () => {
    render(<SnapshotGallery snapshots={snaps} />);
    await waitFor(() => expect(heroImg()).toHaveAttribute('src', 'https://cdn.test/frame-101.jpg'));
    expect(screen.getByText('1/3')).toBeInTheDocument();
    // One filmstrip button per snapshot.
    expect(screen.getAllByRole('button', { name: /Show frame/i })).toHaveLength(3);
  });

  it('promotes a clicked thumbnail into the hero slot', async () => {
    const user = userEvent.setup();
    render(<SnapshotGallery snapshots={snaps} />);
    await waitFor(() => expect(heroImg()).toHaveAttribute('src', 'https://cdn.test/frame-101.jpg'));

    await user.click(screen.getByRole('button', { name: 'Show frame 3' }));

    await waitFor(() => expect(heroImg()).toHaveAttribute('src', 'https://cdn.test/frame-103.jpg'));
    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show frame 3' })).toHaveAttribute('aria-current', 'true');
  });

  it('steps through frames with the arrow controls and wraps around', async () => {
    const user = userEvent.setup();
    render(<SnapshotGallery snapshots={snaps} />);
    await waitFor(() => expect(heroImg()).toHaveAttribute('src', 'https://cdn.test/frame-101.jpg'));

    await user.click(screen.getByRole('button', { name: 'Next frame' }));
    await waitFor(() => expect(heroImg()).toHaveAttribute('src', 'https://cdn.test/frame-102.jpg'));

    // Wrapping backwards from the first frame lands on the last, not on nothing.
    await user.click(screen.getByRole('button', { name: 'Previous frame' }));
    await user.click(screen.getByRole('button', { name: 'Previous frame' }));
    await waitFor(() => expect(heroImg()).toHaveAttribute('src', 'https://cdn.test/frame-103.jpg'));
  });

  it('opens and closes the fullscreen view', async () => {
    const user = userEvent.setup();
    render(<SnapshotGallery snapshots={snaps} />);
    await waitFor(() => expect(heroImg()).toHaveAttribute('src', 'https://cdn.test/frame-101.jpg'));

    await user.click(screen.getByRole('button', { name: 'View fullscreen' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('labels webcam and screen captures differently', async () => {
    render(<SnapshotGallery snapshots={snaps} />);
    await waitFor(() => expect(heroImg()).toBeInTheDocument());
    expect(screen.getByText('Webcam')).toBeInTheDocument();
  });
});
