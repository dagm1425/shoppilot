import HomePage from '../../app/(customer)/page';

const redirectMock = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}));

describe('HomePage', () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it('redirects customer home to /catalog', () => {
    HomePage();

    expect(redirectMock).toHaveBeenCalledWith('/catalog');
  });
});
