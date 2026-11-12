import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { Route } from "react-router-dom";
import Admin from "./Admin";
import { renderWithAuth, httpError, ME } from "../../testUtils";

jest.mock("axios");

const ADMIN = { ...ME, isAdmin: true };
const postReport = {
  _id: "r1",
  targetType: "post",
  targetId: "p1",
  reason: "spam",
  details: "buy now",
  createdAt: new Date().toISOString(),
  reporter: { _id: "u2", username: "darcy" },
  target: { _id: "p1", text: "Cheap watches!", author: { _id: "u7", username: "wick" } },
};
const userReport = {
  _id: "r2",
  targetType: "user",
  targetId: "u8",
  reason: "harassment",
  details: "",
  createdAt: new Date().toISOString(),
  reporter: { _id: "u2", username: "darcy" },
  target: { _id: "u8", username: "collins", bio: "" },
};

const api = (reports = [postReport, userReport]) => {
  axios.get.mockImplementation((url) => {
    if (url === "/admin/stats") return Promise.resolve({ data: { users: 12, circles: 3, openReports: reports.length, suspended: 1 } });
    if (url === "/admin/reports") return Promise.resolve({ data: reports });
    return Promise.resolve({ data: [] });
  });
};

const setup = async (user = ADMIN) => {
  const utils = renderWithAuth(
    <>
      <Route path="/admin">
        <Admin />
      </Route>
      <Route exact path="/" render={() => <p>Home page</p>} />
    </>,
    { user, route: "/admin" }
  );
  await act(async () => {});
  return utils;
};

beforeEach(() => jest.spyOn(window, "confirm").mockReturnValue(true));
afterEach(() => window.confirm.mockRestore());

test("non-admins are sent home and nothing is requested", async () => {
  api();
  await setup(ME);
  expect(screen.getByText("Home page")).toBeInTheDocument();
  expect(axios.get).not.toHaveBeenCalledWith("/admin/reports");
});

test("shows the numbers and each report with its content", async () => {
  api();
  await setup();
  const stats = screen.getByLabelText("Site numbers");
  expect(stats).toHaveTextContent("12Readers");
  expect(stats).toHaveTextContent("2Open reports");
  const [p, u] = within(screen.getByRole("list", { name: "Reports to review" })).getAllByRole("listitem");
  expect(p).toHaveTextContent("Spam or advertising");
  expect(p).toHaveTextContent("post by wick");
  expect(p).toHaveTextContent("Cheap watches!");
  expect(p).toHaveTextContent("Note: buy now");
  expect(u).toHaveTextContent("profile of collins");
  expect(u).toHaveTextContent("(no bio)");
  expect(within(u).queryByRole("button", { name: "Delete post" })).toBeNull();
});

test("Delete post, Suspend and Dismiss call the right endpoints and reload", async () => {
  api();
  axios.delete.mockResolvedValue({ data: {} });
  axios.post.mockResolvedValue({ data: {} });
  await setup();
  const [p, u] = within(screen.getByRole("list", { name: "Reports to review" })).getAllByRole("listitem");
  userEvent.click(within(p).getByRole("button", { name: "Delete post" }));
  await waitFor(() => expect(axios.delete).toHaveBeenCalledWith("/admin/posts/p1"));
  userEvent.click(within(p).getByRole("button", { name: "Suspend wick" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/admin/users/u7/suspend"));
  userEvent.click(within(u).getByRole("button", { name: "Suspend collins" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/admin/users/u8/suspend"));
  userEvent.click(within(u).getByRole("button", { name: "Dismiss" }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith("/admin/reports/r2/dismiss"));
  expect(axios.get.mock.calls.filter(([url]) => url === "/admin/reports").length).toBeGreaterThan(1);
});

test("declining the confirmation does nothing", async () => {
  window.confirm.mockReturnValue(false);
  api();
  await setup();
  userEvent.click(screen.getByRole("button", { name: "Delete post" }));
  expect(axios.delete).not.toHaveBeenCalled();
});

test("errors are shown", async () => {
  api();
  axios.post.mockRejectedValueOnce(httpError(403, { error: "Admins can't be suspended here." }));
  await setup();
  userEvent.click(screen.getByRole("button", { name: "Suspend collins" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("can't be suspended");
});

test("an empty queue says all clear", async () => {
  api([]);
  await setup();
  expect(screen.getByText("All clear")).toBeInTheDocument();
});
