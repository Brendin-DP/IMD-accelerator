"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Play } from "lucide-react";

interface Video {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
}

export default function TenantHelpPage() {
  const videos: Video[] = [
    {
      id: "1",
      title: "Getting Started",
      description: "Learn the basics of using IMD Accelerator",
      thumbnail: "https://via.placeholder.com/400x225?text=Getting+Started",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    {
      id: "2",
      title: "Completing Assessments",
      description: "How to complete your assessments",
      thumbnail: "https://via.placeholder.com/400x225?text=Completing+Assessments",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    {
      id: "3",
      title: "Submitting Reviews",
      description: "How to submit reviews for your peers",
      thumbnail: "https://via.placeholder.com/400x225?text=Submitting+Reviews",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
    {
      id: "4",
      title: "Viewing Results",
      description: "Understanding your assessment results",
      thumbnail: "https://via.placeholder.com/400x225?text=Viewing+Results",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
  ];

  const handleVideoClick = (video: Video) => {
    window.open(video.videoUrl, "_blank");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Help Center</h1>
        <p className="text-muted-foreground mt-2">
          Watch video tutorials to learn how to use IMD Accelerator
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
        {videos.map((video) => (
          <Card
            key={video.id}
            className="group cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]"
            onClick={() => handleVideoClick(video)}
          >
            <CardContent className="p-0">
              <div className="relative aspect-video w-full overflow-hidden rounded-t-lg bg-muted">
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90">
                    <Play className="h-8 w-8 text-primary ml-1" fill="currentColor" />
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-2">{video.title}</h3>
                <p className="text-sm text-muted-foreground">{video.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

