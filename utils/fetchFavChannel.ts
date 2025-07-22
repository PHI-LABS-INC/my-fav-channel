import axios from "axios";

export type MostActiveChannelImage = {
  channelImageUrl: string;
  address: string;
  channelName?: string;
};

export type NeynarUserResponse = {
  [address: string]: Array<{
    fid: number;
    username: string;
    display_name: string;
    pfp_url: string;
    custody_address: string;
    follower_count: number;
    following_count: number;
    verifications: string[];
    score: number;
  }>;
};

export type NeynarUserCastResponse = {
  casts: Array<{
    hash: string;
    channel?: {
      id: string;
      name: string;
      imageUrl?: string;
      image_url?: string;
    };
  }>;
  next: { cursor: string };
};

const NEYNAR_API_BASE_URL = "https://api.neynar.com/v2";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

export async function fetchMostActiveChannelImage(
  address: string
): Promise<MostActiveChannelImage | null> {
  if (!address || typeof address !== "string") {
    throw new Error("Invalid address provided");
  }
  try {
    const addressKey = address.toLowerCase();
    // 1. Fetch the user's Farcaster ID (FID)
    const userResponse = await axios.get<NeynarUserResponse>(
      `${NEYNAR_API_BASE_URL}/farcaster/user/bulk-by-address`,
      {
        params: { addresses: [address] },
        headers: {
          api_key: NEYNAR_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    if (
      !userResponse.data?.[addressKey] ||
      userResponse.data[addressKey].length === 0
    ) {
      return null;
    }
    const userFid = userResponse.data[addressKey][0].fid;
    // 2. Fetch the user's most popular casts
    const castsResponse = await axios.get<NeynarUserCastResponse>(
      `${NEYNAR_API_BASE_URL}/farcaster/feed/user/popular/`,
      {
        params: { fid: userFid },
        headers: {
          api_key: NEYNAR_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    const casts = castsResponse.data?.casts || [];
    if (casts.length === 0) {
      return null;
    }
    // 3. Count the number of casts per channel
    const channelActivity: Record<
      string,
      { count: number; imageUrl: string; name: string }
    > = {};
    for (const cast of casts) {
      if (cast.channel) {
        const { id, image_url, imageUrl, name } = cast.channel;
        const channelImageUrl = image_url || imageUrl || "";
        if (!channelActivity[id])
          channelActivity[id] = { count: 0, imageUrl: channelImageUrl, name };
        channelActivity[id].count++;
      }
    }
    // 4. Find the channel with the highest activity
    const mostActive = Object.entries(channelActivity).reduce<{
      channelId: string;
      count: number;
      imageUrl: string;
      name: string;
    } | null>((max, [channelId, activity]) => {
      if (!max || activity.count > max.count) {
        return { channelId, ...activity };
      }
      return max;
    }, null);
    if (!mostActive) {
      return null;
    }
    return {
      channelImageUrl: mostActive.imageUrl,
      address,
      channelName: mostActive.name,
    };
  } catch (error: any) {
    if (
      axios.isAxiosError(error) &&
      error.response &&
      typeof error.response.status === "number"
    ) {
      if (error.response.status === 401)
        throw new Error("API authentication failed");
      if (error.response.status === 403)
        throw new Error("Access forbidden (403)");
      if (error.response.status === 404) return null;
      if (error.response.status >= 500) throw new Error("Neynar server error");
    }
    throw new Error(
      `Failed to fetch most active channel image for address ${address}: ${error}`
    );
  }
}

// Backward compatibility
export const fetchFirstMintedArtwork = fetchMostActiveChannelImage;
