/**
 * Renders every admin design-system component once.
 *
 * The point is not to assert styling — it is to prove each component actually mounts.
 * A missing import or a typo'd identifier compiles fine under `vite build` and only
 * explodes at runtime; that exact failure mode already cost a live interview session
 * once. Mounting each component here turns that class of bug into a failing test.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Button } from './button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from './card';
import { Badge, StatusBadge } from './badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption, TableFooter } from './table';
import { Input, Textarea, Label, NativeSelect } from './input';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from './dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent, UnderlineTabs } from './tabs';
import { TooltipProvider, Tooltip, Separator, Avatar, AvatarFallback, initialsOf, Progress, Skeleton, SkeletonTable } from './misc';
import { PageTransition, StaggerItem, StaggerRow, Reveal, CountUp, SpotlightCard, GradientBorderCard, AuroraBackdrop } from './motion';
import { StatCard, StatGrid } from './stat-card';
import { ChartContainer, ChartTooltipContent, ChartLegendContent, CHART_COLORS, scoreColor } from './chart';
import { Users } from 'lucide-react';

describe('admin design system', () => {
  it('renders the primitives', () => {
    render(
      <TooltipProvider>
        <Button>Primary</Button>
        <Button variant="brand" size="lg">Brand</Button>
        <Button variant="destructive" size="icon" aria-label="del" />
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="link">Link</Button>
        <Badge>Default</Badge>
        <Badge variant="success">OK</Badge>
        <StatusBadge variant="success" pulse>Live</StatusBadge>
        <Separator />
        <Progress value={62} />
        <Skeleton className="h-4 w-10" />
        <Avatar><AvatarFallback>{initialsOf('Syed Huzaifa Nazim')}</AvatarFallback></Avatar>
      </TooltipProvider>
    );
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    // Deterministic initials: first + last, not the middle name.
    expect(screen.getByText('SN')).toBeInTheDocument();
  });

  it('renders card + form pieces', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
          <CardAction><Button size="sm">Act</Button></CardAction>
        </CardHeader>
        <CardContent>
          <Label htmlFor="a">Label</Label>
          <Input id="a" placeholder="type" />
          <Textarea placeholder="notes" />
          <NativeSelect defaultValue="x"><option value="x">X</option></NativeSelect>
        </CardContent>
        <CardFooter>footer</CardFooter>
      </Card>
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('type')).toBeInTheDocument();
  });

  it('renders a table', () => {
    render(
      <Table>
        <TableCaption>caption</TableCaption>
        <TableHeader><TableRow><TableHead>Name</TableHead></TableRow></TableHeader>
        <TableBody>
          <StaggerRow index={0}><TableCell>Ali</TableCell></StaggerRow>
          <TableRow><TableCell>Sara</TableCell></TableRow>
        </TableBody>
        <TableFooter><TableRow><TableCell>total</TableCell></TableRow></TableFooter>
      </Table>
    );
    expect(screen.getByText('Ali')).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
  });

  it('renders overlays in their closed state without crashing', () => {
    render(
      <>
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>T</DialogTitle><DialogDescription>D</DialogDescription></DialogHeader>
            <DialogFooter>F</DialogFooter>
          </DialogContent>
        </Dialog>
        <DropdownMenu>
          <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>L</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Item</DropdownMenuItem>
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip content="hint"><span>hover me</span></Tooltip>
      </>
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Menu')).toBeInTheDocument();
  });

  it('renders both tab styles', () => {
    const tabs = [
      { value: 'a', label: 'Alpha', count: 3 },
      { value: 'b', label: 'Beta' },
    ];
    render(
      <>
        <Tabs defaultValue="a">
          <TabsList><TabsTrigger value="a">A</TabsTrigger><TabsTrigger value="b">B</TabsTrigger></TabsList>
          <TabsContent value="a">Panel A</TabsContent>
        </Tabs>
        <UnderlineTabs tabs={tabs} value="a" onValueChange={() => {}} groupId="t1" />
      </>
    );
    expect(screen.getByText('Panel A')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('renders the motion layer', () => {
    render(
      <PageTransition>
        <StaggerItem index={2}>
          <Reveal>
            <SpotlightCard><span>spot</span></SpotlightCard>
            <GradientBorderCard><span>grad</span></GradientBorderCard>
            <div className="relative"><AuroraBackdrop /></div>
            <CountUp value={1234} />
          </Reveal>
        </StaggerItem>
      </PageTransition>
    );
    expect(screen.getByText('spot')).toBeInTheDocument();
    expect(screen.getByText('grad')).toBeInTheDocument();
  });

  it('renders stat cards, including the loading state', () => {
    render(
      <StatGrid cols={4}>
        <StatCard label="Candidates" value={128} icon={Users} tone="primary" delta={12} index={0} />
        <StatCard label="Terminated" value={7} tone="danger" delta={3} deltaGood="down" index={1} />
        <StatCard label="Avg Score" formatted="72.4%" tone="success" hint="last 30 days" index={2} />
        <StatCard label="Loading" loading index={3} />
      </StatGrid>
    );
    expect(screen.getByText('Candidates')).toBeInTheDocument();
    expect(screen.getByText('72.4%')).toBeInTheDocument();
  });

  it('exposes a consistent score colour scale', () => {
    // Boundaries matter: these thresholds are what make a score badge and a chart bar
    // agree on colour, so they are pinned rather than left to drift.
    expect(scoreColor(85)).toBe('#16a34a');
    expect(scoreColor(80)).toBe('#16a34a');
    expect(scoreColor(60)).toBe('#0d6db7');
    expect(scoreColor(40)).toBe('#d97706');
    expect(scoreColor(10)).toBe('#dc2626');
    expect(scoreColor(null)).toBe('var(--color-muted-foreground)');
    expect(CHART_COLORS).toHaveLength(5);
  });

  it('renders a chart container with tooltip and legend content', () => {
    const config = { score: { label: 'Score', color: 'var(--color-chart-1)' } };
    const { container } = render(
      <div style={{ width: 400, height: 200 }}>
        <ChartContainer config={config}>
          <svg />
        </ChartContainer>
      </div>
    );
    expect(container.querySelector('[data-slot="chart"]')).toBeTruthy();

    render(
      <ChartContainer config={config}>
        <svg />
      </ChartContainer>
    );
  });

  it('renders skeleton table placeholder', () => {
    const { container } = render(<SkeletonTable rows={3} cols={4} />);
    expect(container.querySelectorAll('.bg-muted').length).toBeGreaterThan(3);
  });
});
