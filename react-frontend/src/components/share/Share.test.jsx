import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import Share, { MAX_LENGTH } from "./Share";
import { renderWithAuth, ME, httpError, networkError } from "../../testUtils";

jest.mock("axios");

const image = (type = "image/png", size = 1000, name = "cover.png") => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const setup = () => {
  const onPosted = jest.fn();
  renderWithAuth(<Share onPosted={onPosted} />);
  return {
    onPosted,
    textbox: screen.getByRole("textbox", { name: /what are you reading/i }),
    postButton: () => screen.getByRole("button", { name: /^post|posting/i }),
    fileInput: screen.getByTestId("share-file"),
  };
};

test("uses the reader's name in the prompt", () => {
  setup();
  expect(screen.getByPlaceholderText(`What are you reading, ${ME.username}?`)).toBeInTheDocument();
});

test("Post is disabled until there's text or a photo", () => {
  const { textbox, postButton } = setup();
  expect(postButton()).toBeDisabled();
  userEvent.type(textbox, "   ");
  expect(postButton()).toBeDisabled();
  userEvent.type(textbox, "Dune");
  expect(postButton()).toBeEnabled();
});

test("posts trimmed text, clears the box and reports the new post", async () => {
  const saved = { _id: "p1", desc: "Dune", userId: ME._id };
  axios.post.mockResolvedValueOnce({ data: saved });
  const { textbox, postButton, onPosted } = setup();
  userEvent.type(textbox, "  Dune  ");
  userEvent.click(postButton());
  await waitFor(() => expect(onPosted).toHaveBeenCalledWith(saved));
  expect(axios.post).toHaveBeenCalledWith("/posts", { userId: ME._id, desc: "Dune", img: undefined });
  expect(textbox).toHaveValue("");
});

test("uploads the photo first, then posts with the server's filename", async () => {
  axios.post
    .mockResolvedValueOnce({ data: { filename: "123-abc.png" } })
    .mockResolvedValueOnce({ data: { _id: "p2" } });
  const { fileInput, postButton, onPosted } = setup();
  userEvent.upload(fileInput, image());
  expect(screen.getByAltText("Selected")).toBeInTheDocument();
  userEvent.click(postButton());
  await waitFor(() => expect(onPosted).toHaveBeenCalled());
  expect(axios.post.mock.calls[0][0]).toBe("/upload");
  expect(axios.post.mock.calls[0][1]).toBeInstanceOf(FormData);
  expect(axios.post.mock.calls[1]).toEqual(["/posts", { userId: ME._id, desc: "", img: "123-abc.png" }]);
  expect(screen.queryByAltText("Selected")).toBeNull();
});

test("the selected photo can be removed", () => {
  const { fileInput, postButton } = setup();
  userEvent.upload(fileInput, image());
  userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
  expect(screen.queryByAltText("Selected")).toBeNull();
  expect(postButton()).toBeDisabled();
});

test.each([
  ["a non-image file", image("application/pdf", 1000, "doc.pdf"), /PNG, JPG/],
  ["an image over 5 MB", image("image/jpeg", 5 * 1024 * 1024 + 1, "big.jpg"), /5 MB/],
])("rejects %s before uploading", (_name, file, message) => {
  const { fileInput } = setup();
  userEvent.upload(fileInput, file, undefined, { applyAccept: false });
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByAltText("Selected")).toBeNull();
  expect(axios.post).not.toHaveBeenCalled();
});

test("does not create the post if the upload fails", async () => {
  axios.post.mockRejectedValueOnce(httpError(400, { error: "Please upload a PNG, JPG, GIF or WebP image." }));
  const { fileInput, postButton, onPosted } = setup();
  userEvent.upload(fileInput, image());
  userEvent.click(postButton());
  expect(await screen.findByRole("alert")).toHaveTextContent("PNG, JPG");
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(onPosted).not.toHaveBeenCalled();
});

test("keeps the text and shows an error when posting fails", async () => {
  axios.post.mockRejectedValueOnce(networkError());
  const { textbox, postButton, onPosted } = setup();
  userEvent.type(textbox, "Dune");
  userEvent.click(postButton());
  expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
  expect(textbox).toHaveValue("Dune");
  expect(onPosted).not.toHaveBeenCalled();
});

test("typing clears a previous error", async () => {
  axios.post.mockRejectedValueOnce(networkError());
  const { textbox, postButton } = setup();
  userEvent.type(textbox, "Dune");
  userEvent.click(postButton());
  await screen.findByRole("alert");
  userEvent.type(textbox, "!");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("shows a counter near the limit and blocks posts over it", () => {
  const { textbox, postButton } = setup();
  userEvent.paste(textbox, "x".repeat(MAX_LENGTH - 10));
  expect(screen.getByText("10")).toBeInTheDocument();
  userEvent.paste(textbox, "x".repeat(20));
  expect(screen.getByText("-10")).toHaveClass("over");
  expect(postButton()).toBeDisabled();
});

test("prevents double submission while posting", async () => {
  let resolve;
  axios.post.mockReturnValueOnce(new Promise((r) => (resolve = r)));
  const { textbox, postButton } = setup();
  userEvent.type(textbox, "Dune");
  userEvent.click(postButton());
  expect(postButton()).toHaveTextContent("Posting…");
  expect(postButton()).toBeDisabled();
  userEvent.click(postButton());
  expect(axios.post).toHaveBeenCalledTimes(1);
  resolve({ data: { _id: "p1" } });
  await waitFor(() => expect(postButton()).toHaveTextContent("Post"));
});
