import Image from 'next/image';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Card, CardContent } from '@/components/ui/card';

export function ImageCarousel({ images, title, imageHints }: { images: string[], title: string, imageHints: string[] }) {
  return (
    <Carousel className="w-full max-w-lg mx-auto">
      <CarouselContent>
        {images.map((src, index) => (
          <CarouselItem key={index}>
            <div className="p-1">
              <Card className="overflow-hidden">
                <CardContent className="flex aspect-square items-center justify-center p-0">
                  <Image
                    src={src}
                    alt={`${title} - image ${index + 1}`}
                    width={600}
                    height={600}
                    className="object-cover w-full h-full"
                    data-ai-hint={imageHints[index] || 'jewelry product'}
                  />
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="hidden sm:flex" />
      <CarouselNext className="hidden sm:flex" />
    </Carousel>
  );
}
