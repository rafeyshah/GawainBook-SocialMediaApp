import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import ReadingProfile, { BlockButton, BlockedReaders, paceLabel, MAX_GENRES, SUGGESTED_GENRES } from "./ReadingProfile";
import { renderWithAuth, httpError, ME } from "../../testUtils";

jest.mock("axios");

const profile = (over = {}) => ({ ...ME, favoriteGenres: [], readingLanguage: null, pace: null, ...over });
const setup = (p, isMe = true) => {
  const onChange = jest.fn();
  const utils = renderWithAuth(<ReadingProfile profile={p} isMe={isMe} onChange={onChange} />);
  return { ...utils, onChange };
};

test("paceLabel", () => {
  expect(paceLabel(1)).toBe("1 chapter a week");
  expect(paceLabel(5)).toBe("5 chapters a week");
  expect(paceLabel(null)).toBe("");
});

describe("showing", () => {
  test("genres, language and pace", () => {
    setup(profile({ favoriteGenres: ["Romantasy", "Classics"], readingLanguage: "de", pace: 4 }), false);
    const facts = screen.getByRole("region", { name: "Reading profile" });
    expect(within(facts).getByText("Romantasy")).toBeInTheDocument();
    expect(within(facts).getByText("German")).toBeInTheDocument();
    expect(within(facts).getByText("4 chapters a week")).toBeInTheDocument();
    expect(within(facts).queryByRole("button")).toBeNull();
  });

  test("an unknown language code is shown as-is", () => {
    setup(profile({ readingLanguage: "sv" }), false);
    expect(screen.getByText("sv")).toBeInTheDocument();
  });

  test("an empty profile is hidden for others, and invites you to fill it in", () => {
    const { unmount } = setup(profile(), false);
    expect(screen.queryByRole("region", { name: "Reading profile" })).toBeNull();
    unmount();
    setup(profile(), true);
    expect(screen.getByText(/Tell other readers/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});

describe("editing", () => {
  test("pick genres, add your own, set language and pace, save", async () => {
    axios.put.mockResolvedValueOnce({ data: { ...ME, favoriteGenres: ["Romance", "Gothic"], readingLanguage: "en", pace: 6 } });
    const { onChange, dispatch } = setup(profile());
    userEvent.click(screen.getByRole("button", { name: "Add" }));
    const form = screen.getByRole("form", { name: "Edit reading profile" });
    const romance = within(form).getByRole("button", { name: "Romance" });
    userEvent.click(romance);
    expect(romance).toHaveAttribute("aria-pressed", "true");
    userEvent.type(within(form).getByLabelText("Add another genre"), "  Gothic {enter}");
    expect(within(form).getByRole("button", { name: "Gothic" })).toHaveAttribute("aria-pressed", "true");
    userEvent.selectOptions(within(form).getByLabelText("I mostly read in"), "en");
    userEvent.type(within(form).getByLabelText(/Usual pace/), "6");
    userEvent.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ favoriteGenres: ["Romance", "Gothic"], readingLanguage: "en", pace: 6 }));
    expect(axios.put).toHaveBeenCalledWith(`/users/${ME._id}`, { favoriteGenres: ["Romance", "Gothic"], readingLanguage: "en", pace: 6 });
    expect(dispatch).toHaveBeenCalledWith({ type: "UPDATE_USER", payload: { favoriteGenres: ["Romance", "Gothic"], readingLanguage: "en", pace: 6 } });
    expect(screen.queryByRole("form", { name: "Edit reading profile" })).toBeNull();
  });

  test("clicking a picked genre unpicks it; duplicates (any case) aren't added", () => {
    setup(profile({ favoriteGenres: ["Fantasy"] }));
    userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit reading profile" });
    userEvent.type(within(form).getByLabelText("Add another genre"), "fantasy{enter}");
    expect(within(form).getAllByRole("button", { name: /^fantasy$/i })).toHaveLength(1);
    userEvent.click(within(form).getByRole("button", { name: "Fantasy" }));
    expect(within(form).getByRole("button", { name: "Fantasy" })).toHaveAttribute("aria-pressed", "false");
    expect(within(form).getByText(`(0/${MAX_GENRES})`)).toBeInTheDocument();
  });

  test(`at ${MAX_GENRES} genres, unpicked ones and the add box are disabled`, () => {
    setup(profile({ favoriteGenres: SUGGESTED_GENRES.slice(0, MAX_GENRES) }));
    userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit reading profile" });
    expect(within(form).getByRole("button", { name: SUGGESTED_GENRES[MAX_GENRES] })).toBeDisabled();
    expect(within(form).getByRole("button", { name: SUGGESTED_GENRES[0] })).toBeEnabled();
    expect(within(form).getByLabelText("Add another genre")).toBeDisabled();
  });

  test("clearing language and pace sends nulls", async () => {
    axios.put.mockResolvedValueOnce({ data: { favoriteGenres: [], readingLanguage: null, pace: null } });
    setup(profile({ readingLanguage: "de", pace: 3 }));
    userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit reading profile" });
    userEvent.selectOptions(within(form).getByLabelText("I mostly read in"), "");
    userEvent.clear(within(form).getByLabelText(/Usual pace/));
    userEvent.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(axios.put).toHaveBeenCalledWith(`/users/${ME._id}`, { favoriteGenres: [], readingLanguage: null, pace: null }));
  });

  test("a server error keeps the form open with the message", async () => {
    axios.put.mockRejectedValueOnce(httpError(400, { error: "Pace must be 1–100 chapters a week." }));
    setup(profile());
    userEvent.click(screen.getByRole("button", { name: "Add" }));
    const form = screen.getByRole("form", { name: "Edit reading profile" });
    userEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Pace must be");
  });

  test("Cancel closes without saving", () => {
    setup(profile());
    userEvent.click(screen.getByRole("button", { name: "Add" }));
    userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Edit reading profile" })).toBeNull();
    expect(axios.put).not.toHaveBeenCalled();
  });
});

describe("blocking", () => {
  beforeEach(() => jest.spyOn(window, "confirm").mockReturnValue(true));
  afterEach(() => window.confirm.mockRestore());

  test("BlockButton confirms, blocks and reports back", async () => {
    axios.put.mockResolvedValueOnce({ data: { blocked: true } });
    const onBlocked = jest.fn();
    renderWithAuth(<BlockButton profile={{ _id: "u2", username: "wick" }} onBlocked={onBlocked} />);
    userEvent.click(screen.getByRole("button", { name: "Block wick" }));
    await waitFor(() => expect(onBlocked).toHaveBeenCalled());
    expect(axios.put).toHaveBeenCalledWith("/blocks/u2");
  });

  test("BlockButton does nothing if you don't confirm, and shows errors", async () => {
    window.confirm.mockReturnValueOnce(false);
    axios.put.mockRejectedValueOnce(httpError(400, { error: "You can't block yourself." }));
    const onBlocked = jest.fn();
    renderWithAuth(<BlockButton profile={{ _id: "u2", username: "wick" }} onBlocked={onBlocked} />);
    userEvent.click(screen.getByRole("button", { name: "Block wick" }));
    expect(axios.put).not.toHaveBeenCalled();
    userEvent.click(screen.getByRole("button", { name: "Block wick" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("can't block yourself");
    expect(onBlocked).not.toHaveBeenCalled();
  });

  test("BlockedReaders lists blocked readers and unblocks them", async () => {
    axios.get.mockResolvedValueOnce({ data: [{ _id: "u2", username: "wick" }, { _id: "u3", username: "collins" }] });
    axios.delete.mockResolvedValueOnce({ data: { blocked: false } });
    renderWithAuth(<BlockedReaders />);
    const section = await screen.findByRole("region", { name: "Blocked readers" });
    userEvent.click(within(within(section).getByText("wick").closest("li")).getByRole("button", { name: "Unblock" }));
    await waitFor(() => expect(within(section).queryByText("wick")).toBeNull());
    expect(axios.delete).toHaveBeenCalledWith("/blocks/u2");
    expect(within(section).getByText("collins")).toBeInTheDocument();
  });

  test("BlockedReaders renders nothing when the list is empty or fails", async () => {
    axios.get.mockRejectedValueOnce(new Error("Network Error"));
    const { container } = renderWithAuth(<BlockedReaders />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });
});
