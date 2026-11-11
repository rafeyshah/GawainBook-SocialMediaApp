import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import PhotoEditor from "./PhotoEditor";
import { renderWithAuth, ME, httpError } from "../../testUtils";

jest.mock("axios");

const image = (type = "image/png", size = 1000, name = "me.png") => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const setup = (props = {}) => {
  const onChange = jest.fn();
  const utils = renderWithAuth(<PhotoEditor field="profilePicture" label="photo" hasImage={false} onChange={onChange} {...props} />);
  return { ...utils, onChange, input: screen.getByTestId(`${props.field || "profilePicture"}-file`) };
};

test("uploads the image, saves it on your account and updates the signed-in user", async () => {
  axios.post.mockResolvedValueOnce({ data: { filename: "uploads/1-a.png" } });
  axios.put.mockResolvedValueOnce({ data: { profilePicture: "uploads/1-a.png" } });
  const { input, onChange, dispatch } = setup();
  userEvent.upload(input, image());
  await waitFor(() => expect(onChange).toHaveBeenCalledWith("uploads/1-a.png"));
  expect(axios.post.mock.calls[0][0]).toBe("/upload");
  expect(axios.post.mock.calls[0][1]).toBeInstanceOf(FormData);
  expect(axios.put).toHaveBeenCalledWith(`/users/${ME._id}`, { profilePicture: "uploads/1-a.png" });
  expect(dispatch).toHaveBeenCalledWith({ type: "UPDATE_USER", payload: { profilePicture: "uploads/1-a.png" } });
});

test("works for the cover image too", async () => {
  axios.post.mockResolvedValueOnce({ data: { filename: "uploads/2-b.jpg" } });
  axios.put.mockResolvedValueOnce({ data: { coverPicture: "uploads/2-b.jpg" } });
  const { input, onChange } = setup({ field: "coverPicture", label: "cover" });
  expect(screen.getByRole("button", { name: "Change cover" })).toBeInTheDocument();
  userEvent.upload(input, image("image/jpeg", 1000, "c.jpg"));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith("uploads/2-b.jpg"));
  expect(axios.put).toHaveBeenCalledWith(`/users/${ME._id}`, { coverPicture: "uploads/2-b.jpg" });
});

test.each([
  ["a non-image", image("application/pdf", 1000, "x.pdf"), /PNG, JPG/],
  ["an image over 5 MB", image("image/png", 5 * 1024 * 1024 + 1), /5 MB/],
])("rejects %s before uploading", (_name, file, message) => {
  const { input, onChange } = setup();
  userEvent.upload(input, file, undefined, { applyAccept: false });
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(axios.post).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});

test("a failed upload shows the server's message and changes nothing", async () => {
  axios.post.mockRejectedValueOnce(httpError(429, { error: "You've uploaded a lot of photos. Please try again later." }));
  const { input, onChange, dispatch } = setup();
  userEvent.upload(input, image());
  expect(await screen.findByRole("alert")).toHaveTextContent("uploaded a lot of photos");
  expect(axios.put).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});

test("a failed save shows the error", async () => {
  axios.post.mockResolvedValueOnce({ data: { filename: "uploads/1-a.png" } });
  axios.put.mockRejectedValueOnce(httpError(400, { error: "Please upload the image first." }));
  const { input, onChange } = setup();
  userEvent.upload(input, image());
  expect(await screen.findByRole("alert")).toHaveTextContent("Please upload the image first.");
  expect(onChange).not.toHaveBeenCalled();
});

test("Remove clears the photo; only shown when there is one", async () => {
  axios.put.mockResolvedValueOnce({ data: { profilePicture: "" } });
  const { onChange, dispatch, unmount } = setup({ hasImage: true });
  userEvent.click(screen.getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(""));
  expect(axios.put).toHaveBeenCalledWith(`/users/${ME._id}`, { profilePicture: "" });
  expect(dispatch).toHaveBeenCalledWith({ type: "UPDATE_USER", payload: { profilePicture: "" } });
  unmount();
  setup({ hasImage: false });
  expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
});

test("the badge variant is a compact camera button with no Remove", () => {
  setup({ variant: "badge", hasImage: true });
  const btn = screen.getByRole("button", { name: "Change photo" });
  expect(btn).toHaveClass("photoBadge");
  expect(btn).not.toHaveTextContent("Change photo");
  expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
});

test("buttons are disabled while uploading", async () => {
  let resolve;
  axios.post.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  axios.put.mockResolvedValueOnce({ data: { profilePicture: "uploads/x.png" } });
  const { input, onChange } = setup();
  userEvent.upload(input, image());
  expect(screen.getByRole("button", { name: "Change photo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Change photo" })).toHaveTextContent("Uploading…");
  resolve({ data: { filename: "uploads/x.png" } });
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(screen.getByRole("button", { name: "Change photo" })).toBeEnabled();
});
