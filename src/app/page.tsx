'use client'
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { placeholders } from "@/constants/data";
export default function Home() {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log(e.target.value);
  };
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log("submitted");
  };

  return (
    <main>
      <section className="h-[80vh]">
        <Tabs defaultValue="all" className="max-w-3xl mx-auto mt-10">
          <TabsList>
            <TabsTrigger value="all">All Jobs</TabsTrigger>
            <TabsTrigger value="recommended">Recommended Jobs</TabsTrigger>
            <TabsTrigger value="auto">Auto Apply</TabsTrigger>
          </TabsList>
          <TabsContent value="all">View all job listings here.</TabsContent>
          <TabsContent value="recommended">View recommended job listings here.</TabsContent>
          <TabsContent value="auto">Enable auto-apply for job listings here.</TabsContent>
        </Tabs>
      </section>
      <div className="max-w-3xl mx-auto flex flex-col justify-center  items-center px-4">
        <PlaceholdersAndVanishInput
          placeholders={placeholders}
          onChange={handleChange}
          onSubmit={onSubmit}
        />
      </div>
    </main>
  );
}
