import {
  Alert02Icon,
  Cancel01Icon,
  Tick02Icon,
  CheckmarkCircle02Icon,
  Folder01Icon,
  InformationCircleIcon,
  Image01Icon,
  HardDriveIcon,
  Add01Icon,
  Delete02Icon,
  Search01Icon,
  ImageDownloadIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChevronRightIcon,
  CheckIcon,
  CircleCheckIcon,
  SearchIcon,
  EyeIcon,
  CircleAlertIcon,
  InfoIcon,
  UploadCloudIcon,
  StarIcon,
  SparklesIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export type PresetIcon = { id: string; name: string; group: string; svg: string };

const ZEST = { ChevronRightIcon, CheckIcon, CircleCheckIcon, SearchIcon, EyeIcon, CircleAlertIcon, InfoIcon, UploadCloudIcon, StarIcon, SparklesIcon, SettingsIcon, UserIcon };
const SELEKT = { Alert02Icon, Cancel01Icon, Tick02Icon, CheckmarkCircle02Icon, Folder01Icon, InformationCircleIcon, Image01Icon, HardDriveIcon, Add01Icon, Delete02Icon, Search01Icon, ImageDownloadIcon };

export const ZEST_GROUP = "Zest (Lucide)";
export const SELEKT_GROUP = "Selekt-2 (Hugeicons)";

const displayName = (exportName: string) =>
  exportName.replace(/Icon$/, "").replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/(\d)([A-Z])/g, "$1 $2");

export const PRESET_ICONS: PresetIcon[] = [
  ...Object.entries(ZEST).map(([name, component]) => ({
    id: `zest/${name}`,
    name: displayName(name),
    group: ZEST_GROUP,
    svg: renderToStaticMarkup(createElement(component)),
  })),
  ...Object.entries(SELEKT).map(([name, icon]) => ({
    id: `selekt/${name}`,
    name: displayName(name),
    group: SELEKT_GROUP,
    svg: renderToStaticMarkup(createElement(HugeiconsIcon, { icon })),
  })),
];

export const DEFAULT_ICON_ID = "zest/SparklesIcon";
