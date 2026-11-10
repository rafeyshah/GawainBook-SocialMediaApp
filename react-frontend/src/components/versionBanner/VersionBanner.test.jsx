import { render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import VersionBanner, { EXPECTED_API_VERSION } from "./VersionBanner";
import { httpError, networkError } from "../../testUtils";

jest.mock("axios");

const health = (data) => axios.get.mockResolvedValueOnce({ data });

test("shows nothing when the server is current", async () => {
  health({ db: "connected", apiVersion: EXPECTED_API_VERSION });
  const { container } = render(<VersionBanner />);
  await waitFor(() => expect(axios.get).toHaveBeenCalledWith("/health"));
  expect(container).toBeEmptyDOMElement();
});

test("shows nothing when the server is newer", async () => {
  health({ db: "connected", apiVersion: EXPECTED_API_VERSION + 1 });
  const { container } = render(<VersionBanner />);
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

test.each([
  ["an older version", { apiVersion: EXPECTED_API_VERSION - 1 }, String(EXPECTED_API_VERSION - 1)],
  ["no version at all (pre-versioning server)", { db: "connected", error: null }, "unknown"],
  ["a non-numeric version", { apiVersion: "abc" }, "unknown"],
])("in development, explains how to fix %s", async (_name, data, shown) => {
  health(data);
  render(<VersionBanner dev />);
  const banner = await screen.findByRole("alert");
  expect(banner).toHaveTextContent("The API server is out of date");
  expect(banner).toHaveTextContent(`version ${shown}`);
  expect(banner).toHaveTextContent("npm start");
});

test("in production, shows a calm 'being updated' message instead", async () => {
  health({ apiVersion: 1 });
  render(<VersionBanner dev={false} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("GawainBook is being updated");
});

test("a 404 health route (very old server) is treated as out of date", async () => {
  axios.get.mockRejectedValueOnce(httpError(404, { error: "Not found." }));
  render(<VersionBanner dev />);
  expect(await screen.findByRole("alert")).toHaveTextContent("out of date");
});

test.each([
  ["a network error", networkError()],
  ["a 503 (database down; reported elsewhere)", httpError(503, { db: "disconnected" })],
])("stays quiet for %s", async (_name, err) => {
  axios.get.mockRejectedValueOnce(err);
  const { container } = render(<VersionBanner dev />);
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(container).toBeEmptyDOMElement();
});
